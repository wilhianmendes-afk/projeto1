#!/usr/bin/env node
/**
 * Importa qualificados COM FOTOS a partir do arquivo JSON exportado do IBIS.
 * As fotos são baixadas diretamente das URLs públicas (não requer login no IBIS).
 *
 * Uso: node scripts/ibis-import-json.js [caminho-do-arquivo]
 * Requer Node.js 18+
 *
 * Retoma automaticamente se interrompido — progresso salvo em ibis-progress.json
 * Para reiniciar do zero: delete o arquivo ibis-progress.json
 */

const fs = require("fs");
const path = require("path");

const JSON_FILE =
  process.argv[2] ||
  "C:\\Users\\PCZINHO\\Downloads\\ibis-qualificados-2026-05-03.json";

const VERCEL_URL    = "https://projeto1-liard-one.vercel.app";
const BATCH_SIZE    = 8;   // 8 fotos por lote (seguro para o limite de payload do Vercel)
const DELAY_MS      = 300;
const PROGRESS_FILE = path.join(__dirname, "ibis-progress.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let totalImported = 0, totalSkipped = 0, totalErrors = 0, totalPhotos = 0;

// Carrega progresso salvo para retomar se interrompido
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log(`♻️  Retomando do índice ${p.nextIndex} — já importados: ${p.totalImported}, fotos: ${p.totalPhotos}`);
      totalImported = p.totalImported || 0;
      totalSkipped  = p.totalSkipped  || 0;
      totalErrors   = p.totalErrors   || 0;
      totalPhotos   = p.totalPhotos   || 0;
      return p.nextIndex || 0;
    }
  } catch {}
  return 0;
}

function saveProgress(nextIndex) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ nextIndex, totalImported, totalSkipped, totalErrors, totalPhotos }));
}

function clearProgress() {
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
}

// Baixa foto da URL pública e retorna base64 (ou null se falhar)
async function downloadPhoto(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) return null; // placeholder vazio
    return buffer.toString("base64");
  } catch { return null; }
}

async function sendBatch(batch) {
  try {
    const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pessoas: batch }),
    });
    if (!res.ok) { totalErrors += batch.length; console.error(`\n  ❌ HTTP ${res.status}`); return; }
    const data = await res.json();
    totalImported += data.imported    ?? 0;
    totalSkipped  += data.skipped     ?? 0;
    totalErrors   += data.errors      ?? 0;
    totalPhotos   += data.photos_saved ?? 0;
    if (data.errorMessages?.length) console.warn("\n  ⚠️  Erros:", JSON.stringify(data.errorMessages));
  } catch (e) {
    totalErrors += batch.length;
    console.error("\n  ❌ Falha de rede:", e.message);
  }
}

async function dispararBackfill() {
  try {
    console.log("\n⚙️  Disparando backfill de embeddings...");
    const res  = await fetch(`${VERCEL_URL}/api/face/backfill`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      console.log(`  🧠 processados=${data.processed} embedded=${data.embedded} restantes=${data.remaining}`);
      if (data.remaining > 0) console.log(`  ⏳ ${data.remaining} pendentes — cron processa às 3h.`);
      else console.log("  ✅ Todos os registros estão indexados!");
    }
  } catch (e) { console.warn("  ⚠️  Backfill não pôde ser disparado:", e.message); }
}

(async function () {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 18) { console.error("❌ Requer Node.js 18+. Atual:", process.version); process.exit(1); }

  console.log(`📂 Lendo: ${JSON_FILE}`);
  let pessoas;
  try {
    const raw = fs.readFileSync(JSON_FILE, "utf8");
    const parsed = JSON.parse(raw);
    pessoas = Array.isArray(parsed) ? parsed : Object.values(parsed);
  } catch (e) { console.error("❌ Erro ao ler JSON:", e.message); process.exit(1); }

  // Filtra registros válidos
  const validos = pessoas.filter(p => p.nome?.trim());
  console.log(`📊 ${validos.length} registros válidos de ${pessoas.length} total`);
  console.log("📸 Fotos serão baixadas diretamente das URLs públicas do IBIS\n");

  const startIndex = loadProgress();
  const start = Date.now();

  for (let i = startIndex; i < validos.length; i += BATCH_SIZE) {
    const chunk = validos.slice(i, Math.min(i + BATCH_SIZE, validos.length));

    // Monta registros e baixa fotos em paralelo dentro do lote
    const batch = await Promise.all(chunk.map(async (p) => {
      const fotoUrl   = p.foto || null;
      const fileMatch = fotoUrl?.match(/fotocrim\/([^?]+)/i);
      const fonte_id  = fileMatch?.[1] || null;

      let rg = null, cpf = null;
      const rg_cpf = p.rg_cpf?.trim() || "";
      if (rg_cpf) {
        const digits = rg_cpf.replace(/\D/g, "");
        if (digits.length === 11) cpf = rg_cpf;
        else if (digits.length > 0) rg = rg_cpf;
      }

      const foto_base64 = await downloadPhoto(fotoUrl);

      return {
        nome:       p.nome.trim(),
        alcunha:    p.alcunha?.trim()    || null,
        genitora:   p.genitora?.trim()   || null,
        nascimento: p.nascimento?.trim() || null,
        rg, cpf, fonte_id, foto_base64,
      };
    }));

    await sendBatch(batch);
    saveProgress(i + BATCH_SIZE);

    const done    = Math.min(i + BATCH_SIZE, validos.length);
    const elapsed = (Date.now() - start) / 1000;
    const rate    = (done - startIndex) / elapsed;
    const restante = rate > 0 ? Math.round((validos.length - done) / rate) : 0;
    const min = Math.floor(restante / 60), sec = restante % 60;

    process.stdout.write(
      `\r📤 ${done}/${validos.length} | importados: ${totalImported} | fotos: ${totalPhotos} | restante: ~${min}m${sec}s   `
    );

    await sleep(DELAY_MS);
  }

  clearProgress();

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\n\n✅ CONCLUÍDO em ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`   Importados:  ${totalImported}`);
  console.log(`   Já existiam: ${totalSkipped}`);
  console.log(`   Fotos:       ${totalPhotos}`);
  console.log(`   Erros:       ${totalErrors}`);

  if (totalImported > 0 || totalPhotos > 0) { await sleep(1000); await dispararBackfill(); }
})();
