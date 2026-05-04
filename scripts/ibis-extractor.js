/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * MODO AUTOMÁTICO (recomendado):
 *   Cole este script no console com o IBIS aberto (qualquer página).
 *   Ele pesquisa AA → ZZ automaticamente, navega todas as páginas e importa tudo.
 *   Progresso salvo no localStorage — retoma de onde parou se fechar o navegador.
 */

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

  // Converte o elemento <img> já carregado na página para base64 via canvas.
  // Evita re-fetch (URLs do PrimeFaces são dinâmicas e retornam 404 se re-requisitadas).
  function imgParaBase64(imgEl) {
    try {
      const w0 = imgEl.naturalWidth, h0 = imgEl.naturalHeight;
      if (!w0 || !h0) return null;
      const MAX = 1200;
      let w = w0, h = h0;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
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
      const col1      = col[1]?.innerText.trim() || "";
      const nomeRaw   = col1.split(/ALCUNHA:/i)[0].trim();
      const nome      = nomeRaw.split("\n")[0].trim();
      if (!nome) return;
      const alcunha    = col1.match(/ALCUNHA:\s*(.+)/i)?.[1]?.trim() || null;
      const genitora   = col[2]?.innerText.trim() || null;
      const nascRaw    = col[3]?.innerText.trim() || "";
      const nascimento = nascRaw.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
      const imgEl      = col[0]?.querySelector("img");
      const fotoUrl    = imgEl?.src || "";
      const fileMatch  = fotoUrl.match(/fotocrim\/([^?]+)/i);
      // Captura a foto agora, enquanto o <img> ainda está no DOM
      const foto_base64 = imgEl ? imgParaBase64(imgEl) : null;
      resultado.push({
        nome, alcunha: alcunha || null, genitora: genitora || null, nascimento,
        rg: null, cpf: null,
        foto_base64,
        fonte_id: fileMatch?.[1] || null,
      });
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
    } catch (e) {
      totalErros++;
      console.error("    ❌ Erro ao enviar:", e.message);
    }
  }

  async function dispararBackfill() {
    try {
      console.log("⚙️  Disparando backfill de embeddings...");
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
      // Aguarda todas as imagens da tabela carregarem antes de capturar
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
      while (Date.now() - ini < 8000) {
        await sleep(400);
        const novas = extrairLinhas();
        if (novas.length && novas[0].nome !== nomeAtual) break;
      }
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
    if (i < combos.length - 1) { console.log(`  ⏳ Aguardando ${PAUSA_BUSCA / 1000}s...`); await sleep(PAUSA_BUSCA); }
  }

  limparProgresso();
  console.log(`\n✅ EXTRAÇÃO CONCLUÍDA!`);
  console.log(`   Total importados: ${totalEnviados}`);
  console.log(`   Erros de rede:    ${totalErros}`);
  if (totalEnviados > 0) { await sleep(1000); await dispararBackfill(); }
})();
