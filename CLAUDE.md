# Intel Facial — 42º BPM
Sistema de reconhecimento facial para inteligência policial.

## Stack
- **Frontend/API**: Next.js 14 (App Router) — deploy na Vercel
- **Banco de dados**: Supabase (Postgres + pgvector + Storage + Auth)
- **Face service**: FastAPI + InsightFace buffalo_l — deploy no Railway
- **URL produção**: https://projeto1-liard-one.vercel.app
- **Face service**: https://projeto1-production-b575.up.railway.app

## Autenticação
Login por usuário (sem @), convertido internamente para `usuario@42bpm.intel`.
Criar usuários pelo painel do Supabase Auth.

## Variáveis de ambiente (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FACE_SERVICE_URL=https://projeto1-production-b575.up.railway.app
IBIS_IMPORT_TOKEN=   # opcional — protege /api/ibis/import e /api/face/backfill
```

## Estrutura do banco

**`qualificados`** — cadastro de pessoas
| Coluna | Tipo | Obs |
|--------|------|-----|
| id | uuid PK | |
| nome | text | obrigatório |
| vulgo | text | alcunha |
| rg | text | |
| cpf | text | |
| nascimento | text | data como string DD/MM/AAAA |
| genitora | text | nome da mãe |
| cidade | text | |
| uf | text | |
| observacoes | text | |
| foto_url | text | URL pública no Storage |
| fotos_extras | text[] | URLs adicionais |
| fonte | text | `"ibis"` ou `"drive"` |
| fonte_id | text | ID único na fonte (evita duplicata) |
| deleted_at | timestamptz | soft delete |
| created_at | timestamptz | |

**`face_embeddings`** — vetores 512d
- `source`, `source_id`, `source_label` — referência ao qualificado
- `photo_url`, `embedding` (vector 512), `bbox`, `det_score`, `face_index`
- Índice HNSW para busca por similaridade

**`face_skipped`** — registros sem rosto detectado
- `source`, `source_id`, `source_label`, `reason`

**Storage bucket `faces`** — fotos em `ibis/` e `drive/`

**RLS**: Desabilitado nas 3 tabelas (`ALTER TABLE x DISABLE ROW LEVEL SECURITY`).

## Clientes Supabase

```typescript
// SSR com anon key — usar APENAS em login/middleware
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Admin direto com service role — usar em TODAS as páginas e endpoints
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

> **CRÍTICO**: `createClient()` SSR e `createServiceClient()` do `@supabase/ssr` **não retornam dados nem fazem INSERT** mesmo com RLS desabilitado. Usar `getAdminClient()` (sem await) em TODAS as páginas e em TODOS os endpoints de importação/backfill.

## Cache Next.js / Vercel

Todas as páginas do dashboard devem ter no topo:
```typescript
export const dynamic = "force-dynamic";
export const revalidate = 0;
```
Sem isso, o Vercel Edge Cache serve dados antigos mesmo após truncate do banco.

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `POST /api/face/search` | Busca facial por imagem enviada (multipart `image`) |
| `GET  /api/face/backfill` | Gera embeddings dos registros pendentes (50 por chamada) |
| `POST /api/face/backfill` | Mesmo — usado pelo cron e pelo script extrator |
| `POST /api/face/index` | Indexa um qualificado específico manualmente |
| `POST /api/drive/import` | Importa fotos do Google Drive |

## Backfill automático
O backfill de embeddings é totalmente automático — nenhum script manual é necessário:

1. **Vercel Cron** (`vercel.json`): executa `POST /api/face/backfill` uma vez por dia às 3h (`0 3 * * *`)
   - Plano Hobby do Vercel só permite 1 execução por dia — não usar `*/30 * * * *`
2. **Script extrator**: ao concluir importação, dispara `POST /api/face/backfill` automaticamente
   - Pode retornar 401 se `IBIS_IMPORT_TOKEN` não configurado — o cron diário supre
3. **Auth do backfill**: aceita:
   - Header `x-backfill-token: <IBIS_IMPORT_TOKEN>`
   - Header Vercel Cron `x-vercel-cron: 1`
   - Usuário logado (sessão SSR)

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats: qualificados, embeddings, sem rosto, cobertura % |
| `/busca` | Busca facial — upload de foto, retorna matches com score |
| `/qualificados` | Grade de fotos (prontuário) com busca por nome, paginação |
| `/qualificados/[id]` | Detalhe do qualificado + embeddings + botão de indexar |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/indexacao` | Status da indexação + importação por Drive |
| `/login` | Login com usuário (sem @) |

## Página de Qualificados (grade)
Fotos estilo prontuário: foto 3:4 + rodapé branco com nome/DN/MÃE/ALC.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start`
- `overflow-hidden` **apenas** no div da foto, não no Link pai
- Rodapé com **inline styles** (não Tailwind): `overflowWrap: 'break-word', wordBreak: 'break-word'`

## Face Service (Railway)
```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed
├── Dockerfile
└── requirements.txt
```
- InsightFace `buffalo_l` com `CPUExecutionProvider`
- `POST /embed` recebe imagem, retorna `{ faces: [{ embedding: float[512], bbox, det_score }] }`

## Integração IBIS (ibis.app.br)
Script de console do navegador: `scripts/ibis-extractor.js`

**Estrutura da tabela confirmada:**
- Seletor: `document.querySelectorAll("table")[2]` (índice 2 — há tabelas de UI antes)
- `col[0]` = foto (img), `col[1]` = nome + "ALCUNHA: xxx", `col[2]` = genitora (texto direto), `col[3]` = nascimento DD/MM/AAAA
- Nome extraído: `col1.split(/ALCUNHA:/i)[0].trim()`

**Campos do formulário de pesquisa (PrimeFaces):**
- Input nome: `formPesquisaPessoa:pesquisaPessoaNome`
- Botão pesquisar: `formPesquisaPessoa:j_idt221`

**Observações:**
- `fonte_id` = nome do arquivo da foto (ex: `AbC123--nome.jpg`) — chave de deduplicação
- Fotos com URL `fotocrim/?pfdrid_c=true` (sem filename) → `naturalWidth=0` → importa sem foto (normal)
- **URLs do PrimeFaces expiram** — NÃO re-fazer fetch. Capturar via `canvas.drawImage(imgEl)` enquanto o `<img>` está no DOM
- Aguardar imagens carregarem antes de capturar: `Promise.all(imgs.map(img => new Promise(r => { img.onload=r; img.onerror=r; setTimeout(r,4000); })))`
- Ao final, dispara backfill automaticamente (pode dar 401 — cron resolve)
- **nascimento**: endpoint converte automaticamente de `DD/MM/AAAA` para `AAAA-MM-DD`
- Busca requer mínimo 2 letras (ex: "AA", "AB"...)

**Lógica de update (registros já existentes):**
Quando `fonte_id` já existe no banco, o endpoint preenche campos vazios sem sobrescrever:
- `foto_url` — se vazia, salva a nova foto
- `vulgo` (alcunha) — se vazio, preenche
- `genitora` — se vazia, preenche
- `nascimento` — se vazio, preenche

**Progresso salvo no localStorage:**
- Chave: `ibis_extractor_progress` — salva `{ nextIndex, totalEnviados, totalErros }`
- Para reiniciar do zero: `localStorage.removeItem("ibis_extractor_progress")`
- Para retomar: basta colar o script de novo — detecta automaticamente

**Como usar (modo automático):**
1. Abra o IBIS logado
2. Cole o script no console — pesquisa AA→ZZ automaticamente
3. Se cair a conexão, cole o script de novo — retoma de onde parou

**Diagnóstico de canvas (se fotos não baixarem):**
```javascript
const tabela = document.querySelectorAll("table")[2];
const img = tabela?.querySelector("img");
console.log("naturalWidth:", img?.naturalWidth, "complete:", img?.complete);
if (img?.naturalWidth > 0) {
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  try { c.getContext("2d").drawImage(img,0,0); console.log("✅ Canvas OK, length:", c.toDataURL("image/jpeg").length); }
  catch(e) { console.error("❌ Canvas erro:", e.message); }
}
```

**Script completo (versão atual — busca automática AA→ZZ + canvas + localStorage):**
```javascript
(async function () {
  const VERCEL_URL   = "https://projeto1-liard-one.vercel.app";
  const NOME_INPUT   = "formPesquisaPessoa:pesquisaPessoaNome";
  const BUSCAR_BTN   = "formPesquisaPessoa:j_idt221";
  const BATCH_SIZE   = 10;
  const PAUSA_BUSCA  = 4000;
  const STORAGE_KEY  = "ibis_extractor_progress";
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  let totalEnviados = saved.totalEnviados || 0;
  let totalErros    = saved.totalErros    || 0;
  let startIndex    = saved.nextIndex     || 0;

  function salvarProgresso(nextIndex) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextIndex, totalEnviados, totalErros }));
  }
  function limparProgresso() { localStorage.removeItem(STORAGE_KEY); }

  function imgParaBase64(imgEl) {
    try {
      const w0 = imgEl.naturalWidth, h0 = imgEl.naturalHeight;
      if (!w0 || !h0) return null;
      const MAX = 1200; let w = w0, h = h0;
      if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(imgEl, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    } catch { return null; }
  }

  function extrairLinhas() {
    const resultado = [];
    const tabela = document.querySelectorAll("table")[2];
    if (!tabela) return resultado;
    tabela.querySelectorAll("tr").forEach(tr => {
      const col = tr.querySelectorAll("td");
      if (col.length < 2) return;
      const col1 = col[1]?.innerText.trim() || "";
      const nomeRaw = col1.split(/ALCUNHA:/i)[0].trim();
      const nome = nomeRaw.split("\n")[0].trim();
      if (!nome) return;
      const alcunha    = col1.match(/ALCUNHA:\s*(.+)/i)?.[1]?.trim() || null;
      const genitora   = col[2]?.innerText.trim() || null;
      const nascRaw    = col[3]?.innerText.trim() || "";
      const nascimento = nascRaw.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
      const imgEl      = col[0]?.querySelector("img");
      const fotoUrl    = imgEl?.src || "";
      const fileMatch  = fotoUrl.match(/fotocrim\/([^?]+)/i);
      const foto_base64 = imgEl ? imgParaBase64(imgEl) : null;
      resultado.push({ nome, alcunha: alcunha || null, genitora: genitora || null, nascimento, rg: null, cpf: null, foto_base64, fonte_id: fileMatch?.[1] || null });
    });
    return resultado;
  }

  async function enviarBatch(batch) {
    try {
      const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(`    ✅ +${data.imported} importados | ${data.skipped} já existiam | fotos: ${data.photos_saved} | foto_erros: ${data.photo_errors ?? 0} | acumulado: ${totalEnviados}`);
      if (data.errorMessages?.length) console.warn("    ⚠️ Erros:", JSON.stringify(data.errorMessages));
    } catch (e) { totalErros++; console.error("    ❌ Erro:", e.message); }
  }

  async function dispararBackfill() {
    try {
      console.log("⚙️  Disparando backfill...");
      const res = await fetch(`${VERCEL_URL}/api/face/backfill`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        console.log(`  🧠 processados=${data.processed} embedded=${data.embedded} skipped=${data.skipped} restantes=${data.remaining}`);
        if (data.remaining > 0) console.log(`  ⏳ ${data.remaining} pendentes — cron processa às 3h.`);
        else console.log("  ✅ Todos os registros estão indexados!");
      }
    } catch (e) { console.warn("  ⚠️  Backfill não disparado:", e.message); }
  }

  async function processarPaginas() {
    let batch = [], pagina = 1, totalPagina = 0;
    while (true) {
      const imgs = Array.from(document.querySelectorAll("table")[2]?.querySelectorAll("img") || []);
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 4000); });
      }));
      const linhas = extrairLinhas();
      if (!linhas.length) break;
      const comFoto = linhas.filter(l => l.foto_base64).length;
      console.log(`  📄 Pág ${pagina}: ${linhas.length} registros (${comFoto} com foto)`);
      totalPagina += linhas.length;
      for (const p of linhas) {
        batch.push(p);
        if (batch.length >= BATCH_SIZE) { await enviarBatch(batch); batch = []; await sleep(300); }
      }
      const nextBtn = document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
      if (!nextBtn) break;
      const nomeAtual = linhas[0].nome;
      nextBtn.click();
      const ini = Date.now();
      while (Date.now() - ini < 8000) { await sleep(400); const novas = extrairLinhas(); if (novas.length && novas[0].nome !== nomeAtual) break; }
      pagina++;
    }
    if (batch.length > 0) await enviarBatch(batch);
    return totalPagina;
  }

  async function pesquisar(termo) {
    const input = document.getElementById(NOME_INPUT);
    const btn   = document.getElementById(BUSCAR_BTN);
    if (!input || !btn) throw new Error("Campos não encontrados");
    input.value = termo;
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.jQuery) jQuery(input).val(termo).trigger("change");
    btn.click();
    await sleep(2000);
    const ini = Date.now();
    while (Date.now() - ini < 10000) { if (extrairLinhas().length > 0) break; await sleep(500); }
  }

  const alfa = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const combos = [];
  for (const a of alfa) for (const b of alfa) combos.push(a + b);

  if (startIndex > 0) {
    console.log(`♻️  Retomando: "${combos[startIndex]}" [${startIndex}/${combos.length}] — já importados: ${totalEnviados}\n`);
  } else {
    console.log(`🚀 Iniciando extração AA → ZZ (${combos.length} buscas) — progresso salvo automaticamente.\n`);
  }

  for (let i = startIndex; i < combos.length; i++) {
    const termo = combos[i];
    console.log(`\n🔍 [${i + 1}/${combos.length}] Pesquisando: "${termo}"`);
    try {
      await pesquisar(termo);
      const total = await processarPaginas();
      console.log(total ? `  ✔ "${termo}" — ${total} registros` : `  ⚪ Sem resultados`);
    } catch (e) { console.error(`  ❌ Erro em "${termo}":`, e.message); }
    salvarProgresso(i + 1);
    if (i < combos.length - 1) { console.log(`  ⏳ Aguardando ${PAUSA_BUSCA/1000}s...`); await sleep(PAUSA_BUSCA); }
  }

  limparProgresso();
  console.log(`\n✅ CONCLUÍDO! Importados: ${totalEnviados} | Erros: ${totalErros}`);
  if (totalEnviados > 0) { await sleep(1000); await dispararBackfill(); }
})();
```

## Script Node.js — Importar JSON do IBIS (`scripts/ibis-import-json.js`)
Para importar arquivo JSON exportado pelo colega (sem fotos — fotos vêm depois pelo extractor do navegador).

**Uso:**
```bash
node scripts/ibis-import-json.js "C:\Users\...\ibis-qualificados-2026-05-03.json"
```
- Requer Node.js 18+
- Importa dados (nome, alcunha, genitora, nascimento, rg/cpf, fonte_id) sem foto
- Ao final dispara backfill automaticamente
- Fotos são adicionadas depois rodando o `ibis-extractor.js` no navegador — registros existentes recebem foto sem criar duplicata

## Deploy (Vercel)
- Branch monitorado: `claude/check-github-access-v30TG`
- **GitHub Action** (`.github/workflows/deploy.yml`): dispara deploy automaticamente a cada push
  - Requer secret `VERCEL_DEPLOY_HOOK` no GitHub (Settings → Secrets → Actions)
  - Hook URL: configurada no Vercel → Settings → Git → Deploy Hooks → "manual-trigger"
- O proxy git do Claude Code **não sincroniza de forma confiável** — sempre fazer `git pull` + `git push` no VS Code após mudanças do Claude Code
- Deploy hook manual (PowerShell):
  ```powershell
  Invoke-RestMethod -Uri "<hook-url>" -Method POST
  ```

## Comandos úteis
```bash
npm run dev       # dev local
npm run build     # checar build

# Reimportar do zero (SQL Editor do Supabase):
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois: limpar Storage bucket faces/ibis/ manualmente no painel do Supabase

# Ver logs do face-service:
# Railway → projeto1 → Deployments → View logs
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
