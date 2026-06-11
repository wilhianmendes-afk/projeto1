#!/usr/bin/env node
/**
 * Remove fotos duplicadas da pasta bancodequalificados@gmail.com no Google Drive.
 * Detecta duplicatas por MD5 (conteúdo idêntico) e por nome de arquivo.
 *
 * Uso:
 *   node scripts/deduplicate-drive.js          → mostra duplicatas (dry run)
 *   node scripts/deduplicate-drive.js --delete  → remove duplicatas (mantém o mais antigo)
 *
 * Requer .env.local com GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 *   GOOGLE_OAUTH_REFRESH_TOKEN e DRIVE_BQ_FOLDER_ID
 */

const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

// Carrega .env.local apenas se as vars ainda não estiverem no ambiente (ex: GitHub Actions)
const needsEnvFile = !process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.DRIVE_BQ_FOLDER_ID;
if (needsEnvFile) {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local não encontrado em", envPath);
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const DELETE_MODE = process.argv.includes("--delete");
const FOLDER_ID   = process.env.DRIVE_BQ_FOLDER_ID;

if (!FOLDER_ID) {
  console.error("❌ DRIVE_BQ_FOLDER_ID não definido no .env.local");
  process.exit(1);
}

function getBQClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

async function listAllFiles(drive, folderId) {
  const files = [];
  const queue = [folderId];
  console.log("📂 Listando arquivos (incluindo subpastas)...");
  while (queue.length > 0) {
    const currentFolder = queue.shift();
    let pageToken;
    do {
      const { data } = await drive.files.list({
        q: `'${currentFolder}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, md5Checksum, createdTime, size, parents)",
        pageSize: 1000,
        pageToken,
      });
      for (const f of data.files ?? []) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          queue.push(f.id);
        } else {
          files.push(f);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  // Ordena por data de criação (mais antigo primeiro) para manter o original ao deduplicar
  files.sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
  return files;
}

async function main() {
  const drive = getBQClient();
  const files = await listAllFiles(drive, FOLDER_ID);

  console.log(`📊 Total de arquivos na pasta: ${files.length}\n`);

  // Agrupa por MD5 (conteúdo idêntico)
  const byMd5 = {};
  const semMd5 = [];
  for (const f of files) {
    if (!f.md5Checksum) { semMd5.push(f); continue; }
    if (!byMd5[f.md5Checksum]) byMd5[f.md5Checksum] = [];
    byMd5[f.md5Checksum].push(f);
  }

  // Duplicatas por conteúdo idêntico (MD5) — único critério de remoção
  const dupsMd5 = Object.values(byMd5).filter((g) => g.length > 1);

  let totalParaRemover = 0;
  const paraRemover = [];

  if (dupsMd5.length === 0) {
    console.log("✅ Nenhuma foto duplicada encontrada!");
    return;
  }

  console.log(`🔴 Fotos com conteúdo IDÊNTICO: ${dupsMd5.length} grupo(s)\n`);
  for (const grupo of dupsMd5) {
    const manter = grupo[0]; // mais antigo (lista ordenada por createdTime asc)
    const remover = grupo.slice(1);
    console.log(`  📎 "${manter.name}" (${grupo.length} cópias idênticas)`);
    console.log(`     ✔ Mantendo: ${manter.createdTime?.slice(0, 10)} — ${manter.name}`);
    for (const r of remover) {
      console.log(`     ✖ Remover:  ${r.createdTime?.slice(0, 10)} — ${r.name} [${r.id}]`);
      paraRemover.push({ id: r.id, name: r.name, parents: r.parents });
      totalParaRemover++;
    }
    console.log();
  }

  console.log(`─────────────────────────────────────────`);
  console.log(`Total a remover: ${totalParaRemover} arquivo(s)`);

  if (!DELETE_MODE) {
    console.log(`\n⚠️  Modo DRY RUN — nenhum arquivo foi apagado.`);
    console.log(`   Para apagar, rode: node scripts/deduplicate-drive.js --delete\n`);
    return;
  }

  // ── Executa remoção ─────────────────────────────────────────────────────
  console.log(`\n🗑️  Removendo ${paraRemover.length} arquivo(s)...\n`);
  let removidos = 0;
  let erros = 0;
  for (const { id, name, parents } of paraRemover) {
    try {
      await drive.files.delete({ fileId: id });
      console.log(`  ✔ Removido: ${name}`);
      removidos++;
    } catch (err) {
      // arquivo enviado por outra conta: só o dono pode deletar, mas o dono da
      // PASTA pode tirá-lo dela (removeParents) — some do Drive BQ do mesmo jeito
      try {
        await drive.files.update({ fileId: id, removeParents: (parents ?? []).join(",") });
        console.log(`  ✔ Removido da pasta (dono é outra conta): ${name}`);
        removidos++;
      } catch (err2) {
        console.log(`  ✖ Erro ao remover ${name}: ${err.message} / removeParents: ${err2.message}`);
        erros++;
      }
    }
  }
  console.log(`\n✅ Concluído: ${removidos} removido(s), ${erros} erro(s).`);
}

main().catch((err) => {
  console.error("Erro fatal:", err.message);
  process.exit(1);
});
