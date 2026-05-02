/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * Como usar:
 * 1. Pesquise manualmente no IBIS (ex: "AA")
 * 2. Quando os resultados aparecerem, cole este script no console e pressione Enter
 * 3. O script lê todas as páginas e envia ao sistema automaticamente
 * 4. Repita para cada combinação de letras
 */

(async function () {
  const VERCEL_URL = "https://projeto1-liard-one.vercel.app";
  const BATCH_SIZE = 10;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let totalEnviados = 0, totalErros = 0;

  // Estrutura desta instalação IBIS (4 colunas, tabela sem ID):
  // [0] foto (img)  [1] nome + "Alcunha: xxx"  [2] "Mãe: xxx / Pai: xxx"  [3] vazio
  function extrairLinhas() {
    const resultado = [];
    const tabela = document.querySelectorAll("table")[1];
    if (!tabela) return resultado;
    tabela.querySelectorAll("tr").forEach(tr => {
      const col = tr.querySelectorAll("td");
      if (col.length < 2) return;

      const col1     = col[1]?.innerText.trim() || "";
      const nome     = col1.split("\n")[0].trim();
      if (!nome) return;

      const alcunha  = col1.match(/Alcunha:\s*(.+)/i)?.[1]?.trim() || null;
      const col2     = col[2]?.innerText.trim() || "";
      const genitora = col2.match(/Mãe:\s*(.+)/i)?.[1]?.trim() || null;
      const fotoUrl  = col[0]?.querySelector("img")?.src || "";
      const fileMatch = fotoUrl.match(/fotocrim\/([^?]+)/i);

      resultado.push({
        nome,
        alcunha,
        genitora,
        nascimento: null,
        rg:         null,
        cpf:        null,
        foto_url:   fotoUrl || null,
        fonte_id:   fileMatch?.[1] || null,
      });
    });
    return resultado;
  }

  async function fotoParaBase64(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else       { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
      });
    } catch { return null; }
  }

  async function enviarBatch(batch) {
    try {
      const res  = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(`  ✅ +${data.imported} importados | ${data.skipped} já existiam | acumulado: ${totalEnviados}`);
    } catch (e) {
      totalErros++;
      console.error("  ❌ Erro ao enviar:", e.message);
    }
  }

  let batch = [], pagina = 1;

  while (true) {
    const linhas = extrairLinhas();

    if (!linhas.length) {
      console.log("⚪ Nenhum registro encontrado nesta página.");
      break;
    }

    console.log(`📄 Pág ${pagina}: ${linhas.length} pessoas — baixando fotos...`);

    for (const p of linhas) {
      if (p.foto_url) {
        p.foto_base64 = await fotoParaBase64(p.foto_url);
        delete p.foto_url;
      }
      batch.push(p);
      if (batch.length >= BATCH_SIZE) {
        await enviarBatch(batch); batch = []; await sleep(300);
      }
    }

    const nextBtn = document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
    if (!nextBtn) break;

    const nomeAtual = linhas[0].nome;
    nextBtn.click();
    const inicio = Date.now();
    while (Date.now() - inicio < 8000) {
      await sleep(400);
      const novas = extrairLinhas();
      if (novas.length && novas[0].nome !== nomeAtual) break;
    }
    pagina++;
  }

  if (batch.length > 0) await enviarBatch(batch);

  console.log(`\n✅ CONCLUÍDO! Total importado: ${totalEnviados} | Erros: ${totalErros}`);
  if (totalEnviados > 0)
    console.log("👉 Quando terminar todas as buscas, acesse /api/face/backfill para gerar os embeddings.");

})();
