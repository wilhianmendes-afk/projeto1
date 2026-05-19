#!/usr/bin/env node
/**
 * Remove TODOS os registros importados via Drive (fonte: "drive" e "local_drive"):
 *   - face_embeddings desses registros
 *   - face_skipped desses registros
 *   - arquivos no Storage (faces/drive/)
 *   - registros na tabela qualificados
 *   - drive_import_queue (limpa fila inteira)
 *   - drive_sync_folders (limpa pastas configuradas)
 *
 * Mantém intactos: qualificados com fonte = "ibis"
 *
 * Uso: node scripts/clear-drive-data.js
 * Uso dry-run (só conta, não apaga): node scripts/clear-drive-data.js --dry-run
 */

const fs   = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

// Carrega .env.local
const envFile = path.join(__dirname, "../.env.local");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split("\n").forEach(line => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET           = "faces";
const BATCH            = 200;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variaveis: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey:          SERVICE_ROLE_KEY,
  Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type":  "application/json",
  Prefer:          "return=representation",
};

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbDelete(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function storagePathFromUrl(url) {
  // https://<proj>.supabase.co/storage/v1/object/public/faces/drive/xxx
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteStorageFiles(paths) {
  if (!paths.length) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.warn(`  Aviso ao deletar storage: ${res.status} ${txt}`);
  }
}

async function deleteStoragePrefix(prefix) {
  let total = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 200, offset: 0, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) break;
    const files = await res.json();
    if (!files.length) break;
    const names = files.map(f => `${prefix}${f.name}`);
    if (!DRY_RUN) await deleteStorageFiles(names);
    total += names.length;
    process.stdout.write(`\r  Storage "${prefix}": ${total} arquivos ${DRY_RUN ? "(dry-run)" : "deletados"}...`);
  }
  if (total) console.log();
  return total;
}

(async function () {
  console.log(DRY_RUN ? "\n[DRY-RUN] Contando registros (nada sera apagado)...\n" : "\nIniciando limpeza de dados do Drive...\n");

  // 1. Buscar IDs dos qualificados drive/local_drive em batches
  let allIds = [];
  let allFotoUrls = [];
  let offset = 0;

  console.log("Buscando qualificados fonte=drive/local_drive...");
  while (true) {
    const rows = await sbGet(
      `/qualificados?select=id,foto_url,fotos_extras&fonte=in.(drive,local_drive)&limit=${BATCH}&offset=${offset}&order=id.asc`
    );
    if (!rows.length) break;
    for (const r of rows) {
      allIds.push(r.id);
      if (r.foto_url) allFotoUrls.push(r.foto_url);
      const extras = Array.isArray(r.fotos_extras) ? r.fotos_extras : [];
      extras.forEach(u => { if (u) allFotoUrls.push(u); });
    }
    offset += rows.length;
    process.stdout.write(`\r  ${allIds.length} registros encontrados...`);
    if (rows.length < BATCH) break;
  }
  console.log(`\n  Total para remover: ${allIds.length} qualificados\n`);

  if (allIds.length === 0) {
    console.log("Nenhum registro drive/local_drive encontrado. Banco ja esta limpo.");
  }

  if (!DRY_RUN && allIds.length > 0) {
    // 2. Apagar face_embeddings (em batches de IDs para evitar URL muito longa)
    console.log("Removendo face_embeddings...");
    let totalEmbed = 0;
    for (let i = 0; i < allIds.length; i += 50) {
      const batch = allIds.slice(i, i + 50);
      const idList = batch.map(id => `"${id}"`).join(",");
      const deleted = await sbDelete(`/face_embeddings?source=eq.qualificados&source_id=in.(${idList})`);
      totalEmbed += Array.isArray(deleted) ? deleted.length : 0;
      process.stdout.write(`\r  ${Math.min(i + 50, allIds.length)}/${allIds.length} processados...`);
    }
    console.log(`\n  face_embeddings removidos.`);

    // 3. Apagar face_skipped
    console.log("Removendo face_skipped...");
    for (let i = 0; i < allIds.length; i += 50) {
      const batch = allIds.slice(i, i + 50);
      const idList = batch.map(id => `"${id}"`).join(",");
      await sbDelete(`/face_skipped?source=eq.qualificados&source_id=in.(${idList})`);
      process.stdout.write(`\r  ${Math.min(i + 50, allIds.length)}/${allIds.length} processados...`);
    }
    console.log(`\n  face_skipped removidos.`);

    // 4. Apagar qualificados
    console.log("Removendo qualificados...");
    for (let i = 0; i < allIds.length; i += 50) {
      const batch = allIds.slice(i, i + 50);
      const idList = batch.map(id => `"${id}"`).join(",");
      await sbDelete(`/qualificados?id=in.(${idList})`);
      process.stdout.write(`\r  ${Math.min(i + 50, allIds.length)}/${allIds.length} removidos...`);
    }
    console.log(`\n  Qualificados removidos.`);
  }

  // 5. Storage — apagar arquivos das pastas drive/
  console.log("Limpando Storage (faces/drive/)...");
  const storTotal = await deleteStoragePrefix("drive/");
  console.log(`  Total Storage: ${storTotal} arquivos ${DRY_RUN ? "encontrados (dry-run)" : "deletados"}.`);

  // 6. Zerar drive_import_queue e drive_sync_folders
  if (!DRY_RUN) {
    console.log("Zerando drive_import_queue...");
    try {
      await sbDelete("/drive_import_queue?done=in.(true,false)");
      console.log("  drive_import_queue limpa.");
    } catch (e) {
      console.warn("  Aviso drive_import_queue:", e.message);
    }

    console.log("Zerando drive_sync_folders...");
    try {
      await sbDelete("/drive_sync_folders?active=in.(true,false)");
      console.log("  drive_sync_folders limpa.");
    } catch (e) {
      console.warn("  Aviso drive_sync_folders:", e.message);
    }
  } else {
    const q = await sbGet("/drive_import_queue?select=count&limit=1");
    const s = await sbGet("/drive_sync_folders?select=count&limit=1");
    console.log(`  drive_import_queue: sera zerada.`);
    console.log(`  drive_sync_folders: sera zerada.`);
  }

  console.log(DRY_RUN
    ? "\n[DRY-RUN] Concluido. Nenhum dado foi alterado. Rode sem --dry-run para executar."
    : `\nConcluido! ${allIds.length} qualificados removidos do Drive. Banco contem apenas registros IBIS.`
  );
})().catch(e => { console.error("\nErro:", e.message); process.exit(1); });
