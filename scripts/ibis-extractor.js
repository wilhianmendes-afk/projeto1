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
  const VERCEL_URL = "https://SEU-PROJETO.vercel.app"; // ← coloque sua URL
  const BATCH_SIZE = 10;   // quantos por envio
  const DELAY_MS   = 1500; // espera entre páginas (ms)
  const LETRAS     = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  // ══════════════════════════════════════════

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let totalEnviados = 0;
  let totalErros    = 0;

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
    // Tenta múltiplos seletores de linha
    const rows = [
      ...document.querySelectorAll("tr.ui-widget-content"),
      ...document.querySelectorAll(".ui-datagrid-column"),
      ...document.querySelectorAll(".ui-datalist-item"),
    ];

    for (const row of rows) {
      const img  = row.querySelector("img");
      const text = row.innerText?.trim() || "";
      if (!text && !img) continue;

      const cells = row.querySelectorAll("td");
      const nome  = cells[1]?.innerText?.trim()
                 || row.querySelector("[id*='nome'],[class*='nome']")?.innerText?.trim()
                 || text.split("\n")[0]?.trim()
                 || "";

      if (!nome || nome.length < 3) continue;

      // Extrai ID do IBIS da URL da foto ou do elemento
      const fotoUrl = img?.src || "";
      const idMatch = fotoUrl.match(/[?&]id=([^&]+)/)
                   || row.id?.match(/(\d+)$/);
      const fonte_id = idMatch?.[1] || null;

      pessoas.push({
        nome,
        foto_url: fotoUrl || null,
        fonte_id,
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
      console.log(`✅ Enviados: ${data.imported} | Ignorados: ${data.skipped} | Total acumulado: ${totalEnviados}`);
    } catch (e) {
      totalErros++;
      console.error("❌ Erro ao enviar batch:", e);
    }
  }

  async function processarPaginas() {
    let batch = [];
    let pagina = 1;

    while (true) {
      console.log(`📄 Processando página ${pagina}...`);
      const linhas = extrairLinhas();

      if (linhas.length === 0) {
        console.log("Nenhuma linha encontrada nesta página.");
        break;
      }

      for (const pessoa of linhas) {
        if (pessoa.foto_url) {
          pessoa.foto_base64 = await fotoParaBase64(pessoa.foto_url);
          delete pessoa.foto_url;
        }
        batch.push(pessoa);
        if (batch.length >= BATCH_SIZE) {
          await enviarBatch(batch);
          batch = [];
          await sleep(500);
        }
      }

      // Tenta ir para próxima página
      const nextBtn = document.querySelector(
        ".ui-paginator-next:not(.ui-state-disabled), [aria-label='Next Page']:not([aria-disabled='true'])"
      );
      if (!nextBtn || nextBtn.classList.contains("ui-state-disabled")) break;

      nextBtn.click();
      await sleep(DELAY_MS);
      pagina++;
    }

    if (batch.length > 0) await enviarBatch(batch);
  }

  async function pesquisarLetra(letra) {
    console.log(`\n🔤 Pesquisando letra: ${letra}`);
    const input = document.querySelector("[id$='pesquisaPessoaNome']");
    if (!input) { console.error("Campo nome não encontrado"); return; }

    input.value = letra;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input",  { bubbles: true }));

    const btn = document.querySelector("[id$='j_idt75']");
    if (!btn) { console.error("Botão pesquisar não encontrado"); return; }

    btn.click();
    await sleep(DELAY_MS);
    await processarPaginas();
  }

  // ── INÍCIO ──
  console.log("🚀 Iniciando extração IBIS → Intel Facial 42º BPM");
  console.log(`📡 Destino: ${VERCEL_URL}`);

  for (const letra of LETRAS) {
    await pesquisarLetra(letra);
    await sleep(1000);
  }

  console.log(`\n✅ CONCLUÍDO! Total enviados: ${totalEnviados} | Erros: ${totalErros}`);

})();
