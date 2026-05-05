#!/usr/bin/env node
/**
 * Deleta todos os arquivos da pasta ibis/ no bucket faces do Supabase.
 * Uso: node scripts/clear-ibis-storage.js
 * Requer: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local
 */

const fs   = require("fs");
const path = require("path");

// Carrega .env.local automaticamente
const envFile = path.join(__dirname, "../.env.local");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split("\n").forEach(line => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET            = "faces";
const PREFIX            = "ibis/";
const BATCH_SIZE        = 100;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Faltam variáveis: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  "apikey":        SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type":  "application/json",
};

async function listarArquivos(offset = 0) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method:  "POST",
    headers,
    body: JSON.stringify({ prefix: PREFIX, limit: BATCH_SIZE, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`Erro ao listar: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deletarArquivos(nomes) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method:  "DELETE",
    headers,
    body: JSON.stringify({ prefixes: nomes }),
  });
  if (!res.ok) throw new Error(`Erro ao deletar: ${res.status} ${await res.text()}`);
  return res.json();
}

(async function () {
  console.log(`🗑️  Limpando pasta "${PREFIX}" no bucket "${BUCKET}"...\n`);
  let totalDeletados = 0;

  while (true) {
    const arquivos = await listarArquivos(0); // sempre offset 0 — deletamos conforme listamos
    if (!arquivos.length) break;

    const nomes = arquivos.map(f => `${PREFIX}${f.name}`);
    await deletarArquivos(nomes);
    totalDeletados += nomes.length;
    process.stdout.write(`\r🗑️  ${totalDeletados} arquivos deletados...`);
  }

  console.log(`\n\n✅ Concluído! ${totalDeletados} arquivos removidos de "${PREFIX}".`);
})().catch(e => { console.error("\n❌", e.message); process.exit(1); });
