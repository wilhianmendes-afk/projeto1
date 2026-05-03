/**
 * IBIS Extractor — Intel Facial 42º BPM
 *
 * MODO AUTOMÁTICO (recomendado):
 *   Cole este script no console com o IBIS aberto (qualquer página).
 *   Ele pesquisa A → Z automaticamente, navega todas as páginas e importa tudo.
 *
 * MODO MANUAL (busca já aberta):
 *   Chame apenas: await processarPaginas()
 */

(async function () {
  const VERCEL_URL   = "https://projeto1-liard-one.vercel.app";
  const NOME_INPUT   = "formPesquisaPessoa:pesquisaPessoaNome";
  const BUSCAR_BTN   = "formPesquisaPessoa:j_idt221";
  const BATCH_SIZE   = 10;
  const PAUSA_BUSCA  = 4000;  // ms entre cada letra (não sobrecarregar o IBIS)
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let totalEnviados = 0, totalErros = 0;

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
      const alcunha   = col1.match(/ALCUNHA:\s*(.+)/i)?.[1]?.trim() || null;
      const genitora  = col[2]?.innerText.trim() || null;
      const nascRaw   = col[3]?.innerText.trim() || "";
      const nascimento = nascRaw.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
      const fotoUrl   = col[0]?.querySelector("img")?.src || "";
      const fileMatch = fotoUrl.match(/fotocrim\/([^?]+)/i);
      resultado.push({
        nome, alcunha: alcunha || null, genitora: genitora || null, nascimento,
        rg: null, cpf: null, foto_url: fotoUrl || null, fonte_id: fileMatch?.[1] || null,
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
          const MAX = 1200; let w = img.width, h = img.height;
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
      const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoas: batch }),
      });
      const data = await res.json();
      totalEnviados += data.imported ?? 0;
      console.log(`    ✅ +${data.imported} importados | ${data.skipped} já existiam | fotos: ${data.photos_saved} | acumulado: ${totalEnviados}`);
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
        if (data.remaining > 0) console.log(`  ⏳ ${data.remaining} pendentes — cron processa automaticamente às 3h.`);
        else console.log("  ✅ Todos os registros estão indexados!");
      }
    } catch (e) { console.warn("  ⚠️  Backfill não disparado:", e.message); }
  }

  // Processa todas as páginas da busca atual
  async function processarPaginas() {
    let batch = [], pagina = 1, totalPagina = 0;
    while (true) {
      const linhas = extrairLinhas();
      if (!linhas.length) break;
      console.log(`  📄 Pág ${pagina}: ${linhas.length} registros`);
      totalPagina += linhas.length;
      for (const p of linhas) {
        if (p.foto_url) { p.foto_base64 = await fotoParaBase64(p.foto_url); delete p.foto_url; }
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
    if (batch.length > 0) { await enviarBatch(batch); }
    return totalPagina;
  }

  // Pesquisa um termo no campo de nome e aguarda resultados
  async function pesquisar(termo) {
    const input = document.getElementById(NOME_INPUT);
    const btn   = document.getElementById(BUSCAR_BTN);
    if (!input || !btn) throw new Error("Campos de pesquisa não encontrados. Verifique se está na tela correta do IBIS.");

    // Limpar outros campos que possam filtrar
    input.value = termo;
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // PrimeFaces usa jQuery internamente — aciona também se disponível
    if (window.jQuery) { jQuery(input).val(termo).trigger("change"); }

    btn.click();

    // Aguardar tabela carregar (até 12s)
    await sleep(2000);
    const ini = Date.now();
    while (Date.now() - ini < 10000) {
      if (extrairLinhas().length > 0) break;
      // Sem resultados também é válido — aguarda um pouco e segue
      await sleep(500);
    }
  }

  // ── LOOP PRINCIPAL AA → ZZ ───────────────────────────────────────────────
  const alfa = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const combos = [];
  for (const a of alfa) for (const b of alfa) combos.push(a + b);

  console.log(`🚀 Iniciando extração automática — ${combos.length} buscas (AA → ZZ)`);
  console.log("   Registros duplicados são ignorados automaticamente pelo servidor.\n");

  for (let i = 0; i < combos.length; i++) {
    const termo = combos[i];
    console.log(`\n🔍 [${i + 1}/${combos.length}] Pesquisando: "${termo}"`);
    try {
      await pesquisar(termo);
      const total = await processarPaginas();
      if (total === 0) console.log(`  ⚪ Sem resultados para "${termo}"`);
      else console.log(`  ✔ "${termo}" concluído — ${total} registros processados`);
    } catch (e) {
      console.error(`  ❌ Erro em "${termo}":`, e.message);
    }
    if (i < combos.length - 1) {
      console.log(`  ⏳ Aguardando ${PAUSA_BUSCA / 1000}s...`);
      await sleep(PAUSA_BUSCA);
    }
  }

  console.log(`\n✅ EXTRAÇÃO CONCLUÍDA!`);
  console.log(`   Total importados: ${totalEnviados}`);
  console.log(`   Erros de rede:    ${totalErros}`);

  if (totalEnviados > 0) { await sleep(1000); await dispararBackfill(); }
})();
