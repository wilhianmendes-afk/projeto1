#!/usr/bin/env node
/**
 * Importa qualificados a partir do arquivo JSON exportado do IBIS
 * Uso: node scripts/ibis-import-json.js [caminho-do-arquivo]
 *
 * Requer Node.js 18+ (fetch nativo)
 * Instale dependências (nenhuma — usa apenas módulos nativos)
 */

const fs = require("fs");

const JSON_FILE =
  process.argv[2] ||
  "C:\\Users\\PCZINHO\\Downloads\\ibis-qualificados-2026-05-03.json";

const VERCEL_URL = "https://projeto1-liard-one.vercel.app";
const BATCH_SIZE = 10;
const DELAY_MS   = 200; // intervalo entre batches

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let totalImported = 0, totalSkipped = 0, totalErrors = 0;

async function sendBatch(batch) {
  try {
    const res = await fetch(`${VERCEL_URL}/api/ibis/import`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pessoas: batch }),
    });
    if (!res.ok) {
      console.error(`  ❌ HTTP ${res.status}`);
      totalErrors += batch.length;
      return;
    }
    const data = await res.json();
    totalImported += data.imported ?? 0;
    totalSkipped  += data.skipped  ?? 0;
    totalErrors   += data.errors   ?? 0;
    process.stdout.write(
      `\r  ✅ importados: ${totalImported} | já existiam: ${totalSkipped} | erros: ${totalErrors}   `
    );
    if (data.errorMessages?.length) {
      console.warn("\n  ⚠️  Erros:", JSON.stringify(data.errorMessages));
    }
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
      console.log(
        `  🧠 processados=${data.processed} embedded=${data.embedded} skipped=${data.skipped} restantes=${data.remaining}`
      );
      if (data.remaining > 0)
        console.log(`  ⏳ ${data.remaining} pendentes — o cron processará automaticamente às 3h.`);
      else
        console.log("  ✅ Todos os registros estão indexados!");
    }
  } catch (e) {
    console.warn("  ⚠️  Backfill não pôde ser disparado agora:", e.message);
  }
}

(async function () {
  // Verificar Node.js 18+
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 18) {
    console.error("❌ Requer Node.js 18 ou superior. Versão atual:", process.version);
    process.exit(1);
  }

  console.log(`📂 Lendo: ${JSON_FILE}`);

  let pessoas;
  try {
    const raw = fs.readFileSync(JSON_FILE, "utf8");
    const parsed = JSON.parse(raw);
    pessoas = Array.isArray(parsed) ? parsed : Object.values(parsed);
  } catch (e) {
    console.error("❌ Erro ao ler JSON:", e.message);
    process.exit(1);
  }

  console.log(`📊 ${pessoas.length} registros encontrados`);
  console.log("🚀 Iniciando importação...\n");
  console.log("   (Fotos serão importadas depois via script do navegador no IBIS)\n");

  const start  = Date.now();
  let batch    = [];
  let i        = 0;

  for (const p of pessoas) {
    if (!p.nome?.trim()) continue;

    const fotoUrl   = p.foto || null;
    const fileMatch = fotoUrl?.match(/fotocrim\/([^?]+)/i);
    const fonte_id  = fileMatch?.[1] || null;

    // Separar RG de CPF pelo número de dígitos
    let rg = null, cpf = null;
    const rg_cpf = p.rg_cpf?.trim() || "";
    if (rg_cpf) {
      const digits = rg_cpf.replace(/\D/g, "");
      if (digits.length === 11) cpf = rg_cpf;
      else if (digits.length > 0) rg = rg_cpf;
    }

    batch.push({
      nome:       p.nome.trim(),
      alcunha:    p.alcunha?.trim()    || null,
      genitora:   p.genitora?.trim()   || null,
      nascimento: p.nascimento?.trim() || null,
      rg,
      cpf,
      fonte_id,
    });

    i++;

    if (batch.length >= BATCH_SIZE) {
      process.stdout.write(`\r📤 ${i}/${pessoas.length} processados — `);
      await sendBatch(batch);
      batch = [];
      await sleep(DELAY_MS);
    }
  }

  if (batch.length > 0) {
    await sendBatch(batch);
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  const min     = Math.floor(elapsed / 60);
  const sec     = elapsed % 60;

  console.log(`\n\n✅ CONCLUÍDO em ${min}m ${sec}s`);
  console.log(`   Importados:   ${totalImported}`);
  console.log(`   Já existiam:  ${totalSkipped}`);
  console.log(`   Erros:        ${totalErrors}`);

  if (totalImported > 0) {
    await sleep(1000);
    await dispararBackfill();
  }

  console.log(
    "\n💡 Para adicionar fotos: abra o IBIS no navegador e use scripts/ibis-extractor.js no console."
  );
  console.log(
    "   Registros já existentes serão atualizados com a foto — sem duplicatas.\n"
  );
})();
