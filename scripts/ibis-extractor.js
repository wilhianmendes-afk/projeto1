/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * Como usar:
 * 1. Faça login no IBIS e vá para pessoaConsulta.xhtml
 * 2. Abra o DevTools (F12) → aba Console
 * 3. Cole este script inteiro e pressione Enter
 * 4. Aguarde — o script vai varrer letra por letra automaticamente
 */

(async function ibisSync() {

  // ══════════════════════════════════════════
  //  CONFIGURAÇÃO — altere aqui
  // ══════════════════════════════════════════
  const VERCEL_URL  = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE  = 10;
  const TIMEOUT_MS  = 15000; // máximo de espera pelos resultados (ms)
  const LETRAS      = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  // ══════════════════════════════════════════

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let totalEnviados = 0, totalErros = 0;

  // Aguarda até a tabela ter linhas com dados (polling)
  async function aguardarTabela() {
    const inicio = Date.now();
    while (Date.now() - inicio < TIMEOUT_MS) {
      const rows = document.querySelectorAll("#formPesquisaPessoa\\:tbPesquisa_data tr");
      for (const tr of rows) {
        if (tr.querySelectorAll("td").length > 0) return true;
      }
      await sleep(400);
    }
    return false; // não apareceu nada
  }

  // Aguarda a tabela mudar de conteúdo (para paginação)
  async function aguardarMudancaDePagina(nomeAnterior) {
    const inicio = Date.now();
    while (Date.now() - inicio < TIMEOUT_MS) {
      const rows = document.querySelectorAll("#formPesquisaPessoa\\:tbPesquisa_data tr");
      for (const tr of rows) {
        const col = tr.querySelectorAll("td");
        const nome = col[2]?.innerText.trim();
        if (nome && nome !== nomeAnterior) return true;
      }
      await sleep(400);
    }
    return false;
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
      console.log(`✅ Enviados: ${data.imported} | Ignorados: ${data.skipped} | Total: ${totalEnviados}`);
    } catch (e) { totalErros++; console.error("❌ Erro:", e); }
  }

  async function processarPaginas() {
    let batch = [], pagina = 1;

    // Aguarda a tabela carregar antes de começar
    const carregou = await aguardarTabela();
    if (!carregou) { console.log("⏱️ Tabela não carregou — pulando letra."); return; }

    while (true) {
      console.log(`📄 Página ${pagina}...`);
      const linhas = extrairLinhas();

      if (linhas.length === 0) { console.log("Fim desta letra."); break; }
      console.log(`   ${linhas.length} registros encontrados`);

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

      // Guarda o primeiro nome da página atual para detectar quando mudou
      const primeiroNomeAtual = linhas[0]?.nome || "";
      nextBtn.click();
      const mudou = await aguardarMudancaDePagina(primeiroNomeAtual);
      if (!mudou) { console.log("⏱️ Próxima página não carregou — parando."); break; }
      pagina++;
    }

    if (batch.length > 0) await enviarBatch(batch);
  }

  async function pesquisarLetra(letra) {
    console.log(`\n🔤 Letra: ${letra}`);
    const input = document.querySelector("[id='formPesquisaPessoa:j_idt100']");
    if (!input) { console.error("Campo nome não encontrado"); return; }
    input.value = letra;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    const btn = document.querySelector("[id='formPesquisaPessoa:j_idt118']");
    if (!btn) { console.error("Botão não encontrado"); return; }
    btn.click();
    await processarPaginas();
  }

  console.log("🚀 Iniciando extração IBIS → Intel Facial 42º BPM");
  console.log(`📡 Destino: ${VERCEL_URL}`);

  for (const letra of LETRAS) {
    await pesquisarLetra(letra);
    await sleep(1500);
  }

  console.log(`\n✅ CONCLUÍDO! Total: ${totalEnviados} | Erros: ${totalErros}`);
  console.log("👉 Acesse /api/face/backfill para gerar os embeddings.");

})();
