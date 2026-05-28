#!/usr/bin/env python3
"""
IBIS Auto-Scraper — extração sistemática e contínua
Varre o IBIS por prefixos de 2 letras (AA..ZZ), extrai dados e importa
para o sistema. Rastreia progresso na tabela ibis_scraper_progress do Supabase.
Após concluir todos os prefixos, reinicia o ciclo (captura novos cadastros).

Uso:
  python scripts/ibis-scraper.py              # 25 prefixos por rodada (padrão)
  python scripts/ibis-scraper.py --limit 10   # processa 10 prefixos

Variáveis de ambiente:
  IBIS_USER, IBIS_PASS
  SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
  IMPORT_URL, IBIS_IMPORT_TOKEN
"""

import asyncio
import argparse
import base64
import json
import re
import os
import sys
import urllib.request
import urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

# ── Configuração ──────────────────────────────────────────────────────────────

def _load_env():
    key = Path(__file__).parent.parent / ".env.local"
    if key.exists() and not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        for line in key.read_text(encoding="utf-8").split("\n"):
            m = re.match(r"^([^#=\s]+)=(.+)$", line)
            if m:
                os.environ.setdefault(m.group(1).strip(), m.group(2).strip())

_load_env()

IBIS_URL     = "https://ibis.app.br/"
IBIS_USER    = os.environ.get("IBIS_USER", "34914")
IBIS_PASS    = os.environ.get("IBIS_PASS", "32971803*Jan")

SUPABASE_URL = (os.environ.get("SUPABASE_URL")
                or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
IMPORT_URL   = os.environ.get("IMPORT_URL",
               "https://projeto1-liard-one.vercel.app/api/ibis/import")
IMPORT_TOKEN = os.environ.get("IBIS_IMPORT_TOKEN", "")

SLEEP_S      = 30  # segundos entre buscas — IBIS é infraestrutura gov frágil (OOM confirmado)
MAX_PAGES    = 15  # máximo de páginas por prefixo

# ── Supabase REST ─────────────────────────────────────────────────────────────

def _sb(method, path, data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    hdrs = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except Exception as e:
        print(f"  [Supabase] {method} {path}: {e}")
        return None

def get_pending(limit):
    rows = _sb("GET", "ibis_scraper_progress", params={
        "status": "eq.pending", "order": "prefix.asc",
        "limit": str(limit), "select": "prefix",
    })
    return [r["prefix"] for r in (rows or [])]

def mark(prefix, status, records_found=0, imported=0, error_msg=None):
    data = {"status": status, "records_found": records_found,
            "imported": imported, "last_run": "now()"}
    if error_msg:
        data["error_msg"] = str(error_msg)[:400]
    _sb("PATCH", "ibis_scraper_progress", data=data,
        params={"prefix": f"eq.{prefix}"})

def reset_cycle():
    """Após concluir todos os prefixos, reseta para novo ciclo."""
    _sb("PATCH", "ibis_scraper_progress",
        data={"status": "pending", "last_run": None, "error_msg": None},
        params={"status": "eq.done"})

# ── Extração de HTML ──────────────────────────────────────────────────────────

def _extrair_tr(tr_html):
    """Extrai dados de uma <tr>. Colunas: FOTO | RG|CPF | NOME | ALCUNHA | GENITORA | DN"""
    from html.parser import HTMLParser

    class _P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.cols, self._cur, self._in = [], [], False
        def handle_starttag(self, tag, attrs):
            if tag == "td":
                self._in = True; self._cur = []
        def handle_endtag(self, tag):
            if tag == "td":
                self._in = False
                self.cols.append(" ".join(self._cur).strip())
        def handle_data(self, d):
            if self._in and d.strip():
                self._cur.append(d.strip())

    p = _P(); p.feed(tr_html)
    c = p.cols
    if len(c) < 3:
        return None

    nome = c[2].strip()
    if not nome or len(nome) < 2:
        return None

    # RG e CPF separados por " | "
    rg = cpf = None
    rc = c[1].strip() if len(c) > 1 else ""
    if " | " in rc:
        pts = rc.split(" | ", 1)
        rg = pts[0].strip() or None
        cpf = pts[1].strip() or None
    elif rc:
        rg = rc

    alcunha  = c[3].strip() or None if len(c) > 3 else None
    genitora = c[4].strip() or None if len(c) > 4 else None
    dn_raw   = c[5].strip()         if len(c) > 5 else ""
    nm = re.search(r"\d{2}/\d{2}/\d{4}", dn_raw)
    nascimento = nm.group(0) if nm else None

    # Foto: extrai src da primeira <img> na TR
    img_m = re.search(r'src="(/resources/fotocrim/[^"]+)"', tr_html)
    foto_src_full = img_m.group(1) if img_m else None          # com ?pfdrid_c=true
    foto_id_m = re.search(r"fotocrim/([^?\"'\s]+)", foto_src_full or "")
    fonte_id = foto_id_m.group(1) if foto_id_m else None

    return {
        "nome": nome,
        "alcunha": alcunha,
        "rg": rg,
        "cpf": cpf,
        "genitora": genitora if genitora and len(genitora) > 2 else None,
        "nascimento": nascimento,
        "fonte_id": fonte_id,
        "foto_src": foto_src_full,  # URL relativa + query string (para download autenticado)
    }

def extrair_pessoas(html):
    trs = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    pessoas = []
    for tr in trs:
        if "<td" not in tr:
            continue
        d = _extrair_tr(tr)
        if d:
            pessoas.append(d)
    return pessoas

# ── Playwright ────────────────────────────────────────────────────────────────

async def login(page):
    await page.goto(IBIS_URL, wait_until="domcontentloaded", timeout=60000)
    u = page.get_by_placeholder("Usuário (RG militar)", exact=False)
    if await u.count() == 0:
        u = page.locator("input:not([type=hidden]):not([type=password])").first
    pw = page.get_by_placeholder("Senha", exact=False)
    if await pw.count() == 0:
        pw = page.locator("input[type=password]").first
    await u.wait_for(state="visible", timeout=10000)
    await u.fill(IBIS_USER)
    await pw.fill(IBIS_PASS)
    btn = page.get_by_role("button", name="Entrar")
    if await btn.count() > 0:
        await btn.click()
    else:
        await pw.press("Enter")
    try:
        await page.wait_for_url(lambda url: "home" in url, timeout=15000)
    except Exception:
        pass
    return "home" in page.url

async def buscar_prefixo(page, prefixo):
    """Retorna lista de pessoas + erro (ou None)."""
    base = IBIS_URL.rstrip("/")
    await page.goto(f"{base}/pessoaConsulta.xhtml",
                    wait_until="domcontentloaded", timeout=20000)
    try:
        await page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass

    campo = page.locator("#formPesquisaPessoa\\:pesquisaPessoaNome").first
    if await campo.count() == 0:
        return None, "campo de nome não encontrado"

    await campo.fill(prefixo)
    btn = page.locator("button:has-text('Pesquisar')").first
    if await btn.count() == 0:
        return None, "botão Pesquisar não encontrado"

    await btn.click()

    # Aguarda div de resultados ser populado
    rdiv = page.locator("#formPesquisaPessoa\\:pnResultadoPesquisa")
    for _ in range(40):
        await asyncio.sleep(1)
        try:
            if (await rdiv.inner_html(timeout=1000)).strip():
                break
        except Exception:
            pass
    else:
        return [], None  # 0 resultados

    todas = []
    for _pg in range(MAX_PAGES):
        try:
            html = await rdiv.inner_html(timeout=5000)
        except Exception:
            break

        pessoas = extrair_pessoas(html)
        todas.extend(pessoas)

        # Próxima página PrimeFaces
        nxt = page.locator(".ui-paginator-next:not(.ui-state-disabled)").first
        if await nxt.count() == 0:
            break
        await nxt.click()
        await asyncio.sleep(2)

    return todas, None

async def baixar_foto(page, foto_src):
    if not foto_src:
        return None
    try:
        url = IBIS_URL.rstrip("/") + foto_src
        r = await page.request.get(url, timeout=15000)
        if r.ok:
            return base64.b64encode(await r.body()).decode()
    except Exception:
        pass
    return None

# ── Import API ────────────────────────────────────────────────────────────────

def importar(pessoas):
    payload = json.dumps({"pessoas": pessoas}).encode()
    req = urllib.request.Request(
        IMPORT_URL, data=payload, method="POST",
        headers={"Content-Type": "application/json",
                 "X-Ibis-Token": IMPORT_TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ── Main ──────────────────────────────────────────────────────────────────────

async def main(limit):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios")
        sys.exit(1)

    prefixes = get_pending(limit)
    if not prefixes:
        print("✅ Ciclo completo — resetando prefixos para nova varredura...")
        reset_cycle()
        prefixes = get_pending(limit)
        if not prefixes:
            print("❌ Falha ao resetar.")
            sys.exit(1)

    print(f"📋 {len(prefixes)} prefixo(s): {', '.join(prefixes[:12])}{'...' if len(prefixes) > 12 else ''}")
    print(f"🌐 {IMPORT_URL}\n")

    total_imp = total_rec = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage",
                  "--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"),
            viewport={"width": 1280, "height": 800},
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = await ctx.new_page()

        print("[login] conectando ao IBIS...")
        if not await login(page):
            print("❌ Login falhou")
            await browser.close()
            sys.exit(1)
        print("[login] OK\n")

        for i, prefix in enumerate(prefixes, 1):
            print(f"[{i:02d}/{len(prefixes)}] '{prefix}' ...", end=" ", flush=True)
            try:
                pessoas, erro = await buscar_prefixo(page, prefix)

                if erro:
                    print(f"⚠️  {erro}")
                    mark(prefix, "error", error_msg=erro)
                elif not pessoas:
                    print("0 resultados")
                    mark(prefix, "done")
                else:
                    print(f"{len(pessoas)} pessoa(s) — baixando fotos...", end=" ", flush=True)
                    payload = []
                    for p in pessoas:
                        foto_b64 = await baixar_foto(page, p.get("foto_src"))
                        if not foto_b64:
                            continue
                        payload.append({
                            "nome":       p["nome"],
                            "alcunha":    p.get("alcunha"),
                            "rg":         p.get("rg"),
                            "cpf":        p.get("cpf"),
                            "genitora":   p.get("genitora"),
                            "nascimento": p.get("nascimento"),
                            "fonte_id":   p.get("fonte_id"),
                            "foto_base64": foto_b64,
                        })

                    if payload:
                        res = importar(payload)
                        imp = res.get("imported", 0)
                        skp = res.get("skipped", 0)
                        print(f"importados={imp} existiam={skp}")
                        total_imp += imp
                        total_rec += len(pessoas)
                        mark(prefix, "done", records_found=len(pessoas), imported=imp)
                    else:
                        print("sem fotos")
                        mark(prefix, "done", records_found=len(pessoas))

            except Exception as e:
                print(f"❌ {e}")
                mark(prefix, "error", error_msg=str(e))

            if i < len(prefixes):
                await asyncio.sleep(SLEEP_S)

        await browser.close()

    print(f"\n{'='*50}")
    print(f"✅ {total_imp} importados de {total_rec} registros | {len(prefixes)} prefixos")

    # Verifica se ciclo completo
    restantes = _sb("GET", "ibis_scraper_progress", params={
        "status": "eq.pending", "select": "prefix", "limit": "1"
    })
    if not restantes:
        print("🔄 Ciclo completo — resetando para nova varredura na próxima execução.")
        reset_cycle()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25,
                    help="Número de prefixos por rodada (padrão: 25)")
    args = ap.parse_args()
    asyncio.run(main(args.limit))
