/**
 * IBIS Extractor Manual — Intel Facial 42º BPM
 *
 * 1. Pesquise normalmente no IBIS (qualquer termo)
 * 2. Cole este script no console — ele processa a página atual e navega
 *    automaticamente por todas as páginas seguintes
 *
 * Extrai: nome, alcunha, nome da mãe, data de nascimento e foto
 */

(async function () {
  const VERCEL_URL  = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE  = 10;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let totalEnviados = 0, totalErros = 0;

  // Captura foto via canvas — URLs do IBIS expiram, não re-fetchar
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

      // col[1] = nome + "ALCUNHA: xxx"
      const col1    = col[1]?.innerText.trim() || "";
      const nomeRaw = col1.split(/ALCUNHA:/i)[0].trim();
      const nome    = nomeRaw.split("\n")[0].trim();
      if (!nome) return;

      const alcunha    = col1.match(/ALCUNHA:\s*(.+)/i)?.[1]?.trim() || null;
      const genitora   = col[2]?.innerText.trim() || null;           // col[2] = mãe
      const nascRaw    = col[3]?.innerText.trim() || "";             // col[3] = nascimento
      const nascimento = nascRaw.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;

      const imgEl     = col[0]?.querySelector("img");
      const fotoUrl   = imgEl?.src || "";
      const fileMatch = fotoUrl.match(/fotocrim\/([^?]+)/i);
      const foto_base64 = imgEl ? imgParaBase64(imgEl) : null;

      resultado.push({
        nome,
        alcunha:    alcunha    || null,
        genitora:   genitora   || null,
        nascimento: nascimento || null,
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(
        `  ✅ +${data.imported} importados | ${data.skipped} já existiam` +
        ` | fotos: ${data.photos_saved} | foto_erros: ${data.photo_errors ?? 0}` +
        ` | acumulado: ${totalEnviados}`
      );
      if (data.errorMessages?.length) console.warn("  ⚠️ Erros:", JSON.stringify(data.errorMessages));
    } catch (e) {
      totalErros++;
      console.error("  ❌ Erro ao enviar:", e.message);
    }
  }

  async function dispararBackfill() {
    try {
      console.log("⚙️  Disparando backfill de embeddings...");
      const res  = await fetch(`${VERCEL_URL}/api/face/backfill`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        console.log(`  🧠 processados=${data.processed} embedded=${data.embedded} skipped=${data.skipped} restantes=${data.remaining}`);
        if (data.remaining > 0) console.log(`  ⏳ ${data.remaining} pendentes — cron processa às 3h.`);
        else console.log("  ✅ Todos os registros estão indexados!");
      }
    } catch (e) { console.warn("  ⚠️  Backfill não disparado:", e.message); }
  }

  // Verifica se há resultados na página atual
  const linhasIniciais = extrairLinhas();
  if (!linhasIniciais.length) {
    console.log("⚪ Nenhum resultado encontrado na página. Faça a pesquisa no IBIS primeiro.");
    return;
  }

  console.log("🚀 Iniciando extração da pesquisa atual...\n");

  let batch = [], pagina = 1, totalGeral = 0;

  while (true) {
    // Aguarda todas as imagens carregarem antes de capturar via canvas
    const imgs = Array.from(document.querySelectorAll("table")[2]?.querySelectorAll("img") || []);
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 4000); });
    }));

    const linhas = extrairLinhas();
    if (!linhas.length) break;

    const comFoto = linhas.filter(l => l.foto_base64).length;
    console.log(`📄 Pág ${pagina}: ${linhas.length} registros (${comFoto} com foto)`);
    totalGeral += linhas.length;

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

  console.log(`\n✅ CONCLUÍDO!`);
  console.log(`   Registros na pesquisa: ${totalGeral}`);
  console.log(`   Importados:            ${totalEnviados}`);
  console.log(`   Erros de rede:         ${totalErros}`);

  if (totalEnviados > 0) { await sleep(1000); await dispararBackfill(); }
})();
