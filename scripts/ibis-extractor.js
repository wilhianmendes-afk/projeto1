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

  // Mesmos seletores do script original (confirmado funcionando)
  function extrairLinhas() {
    const resultado = [];
    const linhas = document.querySelectorAll("#j_idt11\\:j_idt13_data tr");
    linhas.forEach(tr => {
      const col = tr.querySelectorAll("td");
      if (!col.length) return;
      const nome = col[2]?.innerText.trim() || "";
      if (!nome) return;
      const fotoUrl  = tr.querySelector("img")?.src || "";
      const rg_cpf   = col[1]?.innerText.trim() || "";
      const digits   = rg_cpf.replace(/\D/g, "");
      const isCpf    = digits.length === 11;
      const fileMatch = fotoUrl.match(/fotocrim\/([^?]+)/i);
      const idMatch   = fotoUrl.match(/[?&](?:id|pessoaId|codigo)=([^&]+)/i);
      resultado.push({
        nome,
        alcunha:    col[3]?.innerText.trim() || null,
        genitora:   col[4]?.innerText.trim() || null,
        nascimento: col[5]?.innerText.trim() || null,
        rg:         isCpf ? null : (rg_cpf || null),
        cpf:        isCpf ? rg_cpf : null,
        foto_url:   fotoUrl || null,
        fonte_id:   idMatch?.[1] || fileMatch?.[1] || null,
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
        const rd = new FileReader();
        rd.onloadend = () => resolve(rd.result.split(",")[1]);
        rd.readAsDataURL(blob);
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

  // Lê página atual, navega para as próximas, envia tudo
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
        await enviarBatch(batch);
        batch = [];
        await sleep(300);
      }
    }

    // Próxima página
    const nextBtn = document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
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

  console.log(`\n✅ CONCLUÍDO! Total importado: ${totalEnviados} | Erros: ${totalErros}`);
  if (totalEnviados > 0)
    console.log("👉 Quando terminar todas as buscas, acesse /api/face/backfill para gerar os embeddings.");

})();
