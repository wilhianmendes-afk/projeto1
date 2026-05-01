/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * Como usar:
 * 1. Faça login no IBIS e vá para pessoaConsulta.xhtml
 * 2. Abra o DevTools (F12) → aba Console
 * 3. Cole este script inteiro e pressione Enter
 * 4. Aguarde — o script vai varrer todas as combinações de 2 letras automaticamente
 */

(async function ibisSync() {

  // ══════════════════════════════════════════
  //  CONFIGURAÇÃO — altere aqui
  // ══════════════════════════════════════════
  const VERCEL_URL = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE = 10;
  const TIMEOUT_MS = 12000; // máximo de espera pelos resultados (ms)
  // ══════════════════════════════════════════

  // Gera todas as combinações de 2 letras: AA, AB, ..., ZZ
  const PREFIXOS = [];
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      PREFIXOS.push(a + b);
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let totalEnviados = 0, totalErros = 0;

  // Aguarda a tabela MUDAR em relação ao estado anterior
  async function aguardarMudanca(nomeAntes) {
    const inicio = Date.now();
    while (Date.now() - inicio < TIMEOUT_MS) {
      const rows = document.querySelectorAll("#formPesquisaPessoa\\:tbPesquisa_data tr");
      for (const tr of rows) {
        const col = tr.querySelectorAll("td");
        const nome = col[2]?.innerText.trim();
        if (nome && nome !== nomeAntes) return "resultado";
      }
      // Detecta mensagem de "sem resultados" do PrimeFaces
      const tbody = document.querySelector("#formPesquisaPessoa\\:tbPesquisa_data");
      if (tbody && tbody.innerText.trim() && !tbody.querySelector("td")) return "vazio";
      await sleep(400);
    }
    return "timeout";
  }

  async function fotoParaBase64(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  function extrairLinhas() {
    const pessoas = [];
    const rows = document.querySelectorAll("#formPesquisaPessoa\\:tbPesquisa_data tr");
    for (const tr of rows) {
      const col = tr.querySelectorAll("td");
      if (!col.length) continue;
      const nome = col[2]?.innerText.trim() || "";
      if (!nome || nome.length < 3) continue;
      const fotoUrl = tr.querySelector("img")?.src || "";
      const rg_cpf  = col[1]?.innerText.trim() || "";
      const digits  = rg_cpf.replace(/\D/g, "");
      const isCpf   = digits.length === 11;
      const idMatch = fotoUrl.match(/[?&](?:id|pessoaId|codigo)=([^&]+)/i);
      pessoas.push({
        nome,
        alcunha:    col[3]?.innerText.trim() || null,
        genitora:   col[4]?.innerText.trim() || null,
        nascimento: col[5]?.innerText.trim() || null,
        rg:         isCpf ? null : (rg_cpf || null),
        cpf:        isCpf ? rg_cpf : null,
        foto_url:   fotoUrl || null,
        fonte_id:   idMatch?.[1] || null,
      });
    }
    return pessoas;
  }

  async function enviarBatch(batch) {
    try {
      const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(`  ✅ +${data.imported} | ignorados: ${data.skipped} | total: ${totalEnviados}`);
    } catch (e) { totalErros++; console.error("  ❌ Erro:", e); }
  }

  async function processarPaginas(primeiroNomeBusca) {
    let batch = [], pagina = 1;

    while (true) {
      const linhas = extrairLinhas();
      if (linhas.length === 0) break;

      console.log(`  📄 Pág ${pagina}: ${linhas.length} registros`);

      for (const pessoa of linhas) {
        if (pessoa.foto_url) {
          pessoa.foto_base64 = await fotoParaBase64(pessoa.foto_url);
          delete pessoa.foto_url;
        }
        batch.push(pessoa);
        if (batch.length >= BATCH_SIZE) { await enviarBatch(batch); batch = []; await sleep(300); }
      }

      const nextBtn =
        document.querySelector("#formPesquisaPessoa\\:tbPesquisa_paginator_bottom .ui-paginator-next:not(.ui-state-disabled)") ||
        document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
      if (!nextBtn) break;

      const nomeAtual = linhas[0].nome;
      nextBtn.click();
      const status = await aguardarMudanca(nomeAtual);
      if (status !== "resultado") break;
      pagina++;
    }

    if (batch.length > 0) await enviarBatch(batch);
  }

  async function pesquisar(prefixo) {
    const input = document.querySelector("[id='formPesquisaPessoa:j_idt100']");
    if (!input) { console.error("Campo nome não encontrado — abortando."); return false; }
    const btn = document.querySelector("[id='formPesquisaPessoa:j_idt118']");
    if (!btn) { console.error("Botão pesquisar não encontrado — abortando."); return false; }

    // Captura o primeiro nome atual para detectar mudança após a busca
    const nomeAntes = extrairLinhas()[0]?.nome || "__vazio__";

    input.value = prefixo;
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    const status = await aguardarMudanca(nomeAntes);
    return status === "resultado";
  }

  // ── INÍCIO ──
  console.log("🚀 Iniciando extração IBIS → Intel Facial 42º BPM");
  console.log(`📡 Destino: ${VERCEL_URL}`);
  console.log(`🔢 Total de prefixos: ${PREFIXOS.length} (AA → ZZ)`);

  for (let i = 0; i < PREFIXOS.length; i++) {
    const prefixo = PREFIXOS[i];
    const temResultado = await pesquisar(prefixo);
    if (temResultado) {
      console.log(`🔤 ${prefixo} (${i + 1}/${PREFIXOS.length})`);
      await processarPaginas();
    }
    await sleep(800);
  }

  console.log(`\n✅ CONCLUÍDO! Total enviados: ${totalEnviados} | Erros: ${totalErros}`);
  console.log("👉 Acesse /api/face/backfill para gerar os embeddings.");

})();
