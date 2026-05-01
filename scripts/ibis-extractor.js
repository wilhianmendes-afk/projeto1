/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * Como usar:
 * 1. Faça login no IBIS e vá para pessoaConsulta.xhtml
 * 2. Abra o DevTools (F12) → aba Console
 * 3. Cole este script inteiro e pressione Enter
 */

(async function ibisSync() {

  const VERCEL_URL = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE = 10;
  const WAIT_MS    = 8000; // espera máxima por resultados após cada busca

  // Gera todas as combinações de 2 letras: AA, AB, ..., ZZ
  const PREFIXOS = [];
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
      PREFIXOS.push(a + b);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let totalEnviados = 0, totalErros = 0;

  function getInput() { return document.querySelector("[id='formPesquisaPessoa:j_idt100']"); }
  function getBtn()   { return document.querySelector("[id='formPesquisaPessoa:j_idt118']"); }

  // Simula digitação real caractere a caractere (mais compatível com JSF)
  async function digitarNoInput(input, texto) {
    input.focus();
    // Limpa o campo simulando Ctrl+A + Delete
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    for (const char of texto) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Key' + char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, code: 'Key' + char, bubbles: true }));
      input.value += char;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      input.dispatchEvent(new KeyboardEvent('keyup',  { key: char, code: 'Key' + char, bubbles: true }));
      await sleep(60);
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await sleep(150);
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
      const fileMatch = fotoUrl.match(/fotocrim\/([^?]+)/i);
      const idMatch   = fotoUrl.match(/[?&](?:id|pessoaId|codigo)=([^&]+)/i);
      pessoas.push({
        nome,
        alcunha:    col[3]?.innerText.trim() || null,
        genitora:   col[4]?.innerText.trim() || null,
        nascimento: col[5]?.innerText.trim() || null,
        rg:         isCpf ? null : (rg_cpf || null),
        cpf:        isCpf ? rg_cpf : null,
        foto_url:   fotoUrl || null,
        fonte_id:   idMatch?.[1] || fileMatch?.[1] || null,
      });
    }
    return pessoas;
  }

  function tabelaVazia() {
    // Detecta mensagem de "sem resultados" do PrimeFaces
    const emptyRow = document.querySelector("#formPesquisaPessoa\\:tbPesquisa_data tr.ui-datatable-empty-message");
    return !!emptyRow;
  }

  // Aguarda a tabela mostrar resultados diferentes do estado anterior
  async function aguardarResultado(nomeAntes) {
    const inicio = Date.now();
    while (Date.now() - inicio < WAIT_MS) {
      if (tabelaVazia()) return false; // sem resultados — pula rápido
      const linhas = extrairLinhas();
      if (linhas.length > 0 && linhas[0].nome !== nomeAntes) return true;
      await sleep(350);
    }
    return false;
  }

  async function fotoParaBase64(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise(resolve => {
        const rd = new FileReader();
        rd.onloadend = () => resolve(rd.result.split(",")[1]);
        rd.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function enviarBatch(batch) {
    try {
      const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(`  ✅ +${data.imported} | ignorados: ${data.skipped} | total: ${totalEnviados}`);
    } catch(e) { totalErros++; console.error("  ❌ Erro:", e); }
  }

  async function processarPaginas() {
    let batch = [], pagina = 1;
    while (true) {
      const linhas = extrairLinhas();
      if (!linhas.length) break;
      console.log(`  📄 Pág ${pagina}: ${linhas.length} registros`);
      for (const p of linhas) {
        if (p.foto_url) { p.foto_base64 = await fotoParaBase64(p.foto_url); delete p.foto_url; }
        batch.push(p);
        if (batch.length >= BATCH_SIZE) { await enviarBatch(batch); batch = []; await sleep(300); }
      }
      const next =
        document.querySelector("#formPesquisaPessoa\\:tbPesquisa_paginator_bottom .ui-paginator-next:not(.ui-state-disabled)") ||
        document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
      if (!next) break;
      const nomeAtual = linhas[0].nome;
      next.click();
      const mudou = await aguardarResultado(nomeAtual);
      if (!mudou) break;
      pagina++;
    }
    if (batch.length > 0) await enviarBatch(batch);
  }

  async function pesquisar(prefixo) {
    const input = getInput();
    const btn   = getBtn();
    if (!input || !btn) { console.error("❌ Elementos não encontrados — verifique se está na página correta"); return false; }

    const nomeAntes = extrairLinhas()[0]?.nome || "__INICIO__";

    await digitarNoInput(input, prefixo);

    // Tenta Enter no campo primeiro
    input.dispatchEvent(new KeyboardEvent('keydown',  { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',    { key: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(200);

    // Clica no botão também
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    return aguardarResultado(nomeAntes);
  }

  // ── INÍCIO ──
  console.log("🚀 Iniciando extração IBIS → Intel Facial 42º BPM");
  console.log(`📡 Destino: ${VERCEL_URL} | ${PREFIXOS.length} combinações (AA→ZZ)`);

  for (let i = 0; i < PREFIXOS.length; i++) {
    const prefixo = PREFIXOS[i];
    const temResultado = await pesquisar(prefixo);
    if (temResultado) {
      console.log(`🔤 ${prefixo} (${i + 1}/${PREFIXOS.length})`);
      await processarPaginas();
    }
    await sleep(600);
  }

  console.log(`\n✅ CONCLUÍDO! Total: ${totalEnviados} | Erros: ${totalErros}`);
  console.log("👉 Acesse /api/face/backfill para gerar os embeddings.");

})();
