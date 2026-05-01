/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * ════════════════════════════════════════
 *  MODO MANUAL (RECOMENDADO — sempre funciona)
 * ════════════════════════════════════════
 * 1. Abra o DevTools (F12) → aba Console
 * 2. Cole este script e pressione Enter
 * 3. Pesquise qualquer nome no IBIS normalmente (ex: "AA")
 * 4. Quando aparecerem resultados, chame: ibis.ler()
 * 5. O script extrai todas as páginas e envia ao sistema
 * 6. Repita os passos 3-4 para cada combinação
 *
 * ════════════════════════════════════════
 *  MODO AUTOMÁTICO (pode não funcionar em todos os servidores)
 * ════════════════════════════════════════
 * 1. Cole o script e pressione Enter
 * 2. Chame: ibis.auto()
 * 3. Aguarde — percorre AA→ZZ automaticamente
 */

(function () {
  const VERCEL_URL  = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE  = 10;
  const WAIT_MS     = 9000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Seletores ──────────────────────────────────────────────────
  const sel = {
    input:   "[id='formPesquisaPessoa:j_idt100']",
    btn:     "[id='formPesquisaPessoa:j_idt118']",
    tabBody: "#formPesquisaPessoa\\:tbPesquisa_data",
    empty:   "#formPesquisaPessoa\\:tbPesquisa_data tr.ui-datatable-empty-message",
    nextBtn: ".ui-paginator-next:not(.ui-state-disabled)",
  };

  function getInput() { return document.querySelector(sel.input); }
  function getBtn()   { return document.querySelector(sel.btn); }

  // ── Extração de dados da tabela ────────────────────────────────
  function extrairLinhas() {
    const pessoas = [];
    const rows = document.querySelectorAll(sel.tabBody + " tr");
    for (const tr of rows) {
      const col = tr.querySelectorAll("td");
      if (!col.length) continue;
      const nome = col[2]?.innerText.trim() || "";
      if (!nome || nome.length < 3) continue;
      const fotoUrl  = tr.querySelector("img")?.src || "";
      const rg_cpf   = col[1]?.innerText.trim() || "";
      const digits   = rg_cpf.replace(/\D/g, "");
      const isCpf    = digits.length === 11;
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
    return !!document.querySelector(sel.empty);
  }

  // ── Download de foto em base64 ─────────────────────────────────
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

  // ── Envio para o sistema ───────────────────────────────────────
  async function enviarBatch(batch) {
    try {
      const res  = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      ibis.totalEnviados += data.imported ?? 0;
      console.log(`  ✅ +${data.imported} importados | ${data.skipped} já existiam | acumulado: ${ibis.totalEnviados}`);
    } catch (e) {
      ibis.totalErros++;
      console.error("  ❌ Erro ao enviar:", e.message);
    }
  }

  // ── Lê todas as páginas da busca atual ─────────────────────────
  async function lerTodasPaginas() {
    let batch = [], pagina = 1;

    while (true) {
      if (tabelaVazia()) { console.log("  ⚪ Sem resultados nesta página"); break; }
      const linhas = extrairLinhas();
      if (!linhas.length) break;
      console.log(`  📄 Pág ${pagina}: ${linhas.length} registros — baixando fotos...`);

      for (const p of linhas) {
        if (p.foto_url) {
          p.foto_base64 = await fotoParaBase64(p.foto_url);
          delete p.foto_url;
        }
        batch.push(p);
        if (batch.length >= BATCH_SIZE) {
          await enviarBatch(batch);
          batch = [];
          await sleep(300);
        }
      }

      const nextBtn = document.querySelector(sel.nextBtn);
      if (!nextBtn) break;

      const nomeAtual = linhas[0].nome;
      nextBtn.click();
      // Aguarda a tabela mudar
      const inicio = Date.now();
      while (Date.now() - inicio < 8000) {
        await sleep(400);
        const novas = extrairLinhas();
        if (novas.length && novas[0].nome !== nomeAtual) break;
      }
      pagina++;
    }

    if (batch.length > 0) await enviarBatch(batch);
    console.log(`✅ Leitura concluída — acumulado: ${ibis.totalEnviados} | erros: ${ibis.totalErros}`);
  }

  // ── Modo automático: digita caractere a caractere ──────────────
  async function digitarNoInput(input, texto) {
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (const char of texto) {
      input.dispatchEvent(new KeyboardEvent('keydown',  { key: char, code: 'Key' + char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, code: 'Key' + char, bubbles: true }));
      input.value += char;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      input.dispatchEvent(new KeyboardEvent('keyup',    { key: char, code: 'Key' + char, bubbles: true }));
      await sleep(60);
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await sleep(200);
  }

  async function pesquisarAuto(prefixo) {
    const input = getInput();
    const btn   = getBtn();
    if (!input || !btn) { console.error("❌ Elementos não encontrados"); return false; }

    const nomeAntes = extrairLinhas()[0]?.nome ?? "__VAZIO__";
    await digitarNoInput(input, prefixo);

    // 1) Enter no campo
    input.dispatchEvent(new KeyboardEvent('keydown',  { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',    { key: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(300);

    // 2) Clique via jQuery (PrimeFaces já carrega jQuery)
    if (window.jQuery) jQuery(btn).trigger('click');
    else btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    // Aguarda mudança na tabela
    const inicio = Date.now();
    while (Date.now() - inicio < WAIT_MS) {
      if (tabelaVazia()) return false;
      const linhas = extrairLinhas();
      if (linhas.length && linhas[0].nome !== nomeAntes) return true;
      await sleep(350);
    }
    return false;
  }

  // ── API pública ────────────────────────────────────────────────
  window.ibis = {
    totalEnviados: 0,
    totalErros:    0,

    /** Lê os resultados da busca atual e envia ao sistema.
     *  Use após pesquisar manualmente no IBIS. */
    async ler() {
      console.log("📤 Lendo resultados e enviando ao sistema...");
      await lerTodasPaginas();
    },

    /** Automação completa AA→ZZ. Pode não funcionar em todos os servidores IBIS.
     *  Se Total permanecer 0, use ibis.ler() no modo manual. */
    async auto() {
      const PREFIXOS = [];
      for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
          PREFIXOS.push(a + b);

      console.log(`🤖 Modo automático — ${PREFIXOS.length} combinações (AA→ZZ)`);

      for (let i = 0; i < PREFIXOS.length; i++) {
        const pref = PREFIXOS[i];
        process.stdout?.write?.(`\r🔤 ${pref} (${i + 1}/${PREFIXOS.length})`);
        const temRes = await pesquisarAuto(pref);
        if (temRes) {
          console.log(`\n🔤 ${pref} — com resultados`);
          await lerTodasPaginas();
        }
        await sleep(700);
      }
      console.log(`\n✅ CONCLUÍDO! Total: ${ibis.totalEnviados} | Erros: ${ibis.totalErros}`);
      console.log("👉 Acesse /api/face/backfill para gerar os embeddings.");
    },
  };

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  IBIS Extractor — Intel Facial 42º BPM      ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  MODO MANUAL (recomendado):                  ║");
  console.log("║    1. Pesquise no IBIS (ex: 'AA')            ║");
  console.log("║    2. Chame: ibis.ler()                      ║");
  console.log("║    Repita para cada combinação               ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  MODO AUTOMÁTICO:                            ║");
  console.log("║    Chame: ibis.auto()                        ║");
  console.log("╚══════════════════════════════════════════════╝");

})();
