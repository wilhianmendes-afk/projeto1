/**
 * Importação gradual do Google Drive.
 * Pode rodar localmente ou via GitHub Actions.
 * Progresso salvo no Supabase — retoma de onde parou.
 *
 * Uso local:
 *   node scripts/drive-import-local.js            (loop contínuo)
 *   node scripts/drive-import-local.js --batch 20 (20 fotos e para)
 *
 * Variáveis de ambiente necessárias (lidas de .env.local ou do ambiente):
 *   GOOGLE_SERVICE_ACCOUNT_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY, FACE_SERVICE_URL
 */

try {
  require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });
} catch { /* no dotenv in CI — env vars come from GitHub secrets */ }

const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const https = require("https");

const ROOT_FOLDER_ID = "1XzKRnRfmhQi-wFXgHn2dzG9EOwZdGwAF";
const FACE_URL = process.env.FACE_SERVICE_URL || "https://projeto1-production-b575.up.railway.app";
const BATCH_ARG = process.argv.indexOf("--batch");
const BATCH_SIZE = BATCH_ARG !== -1 ? parseInt(process.argv[BATCH_ARG + 1]) || 50 : 50;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const driveAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file", // criar/deletar docs temporários de OCR
  ],
});
const drive = google.drive({ version: "v3", auth: driveAuth });

// ── Escanear Drive e popular fila ─────────────────────────────────────────────
async function listAllImages(folderId, collected = []) {
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
    });
    for (const f of data?.files ?? []) {
      if (f.id && f.name) collected.push({ file_id: f.id, file_name: f.name, mime_type: f.mimeType || "image/jpeg" });
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);

  const { data: subData } = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 100,
  });
  for (const sub of subData?.files ?? []) {
    if (sub.id) {
      process.stdout.write(`  Escaneando: ${sub.name}...                    \r`);
      await listAllImages(sub.id, collected);
    }
  }
  return collected;
}

async function populateQueue() {
  console.log("Escaneando Drive (só precisa fazer isso uma vez)...");
  const files = await listAllImages(ROOT_FOLDER_ID);
  console.log(`\n${files.length} fotos encontradas. Inserindo na fila...`);

  // Insere em lotes de 500 (upsert — ignora duplicatas)
  for (let i = 0; i < files.length; i += 500) {
    const batch = files.slice(i, i + 500);
    await sb.from("drive_import_queue").upsert(batch, { onConflict: "file_id", ignoreDuplicates: true });
    process.stdout.write(`  ${Math.min(i + 500, files.length)}/${files.length}\r`);
  }
  console.log("\nFila populada!");
}

// ── OCR via OCR.space API (sem tocar no Drive, sem quota) ────────────────────
function ocr(buffer) {
  return new Promise((resolve) => {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) { resolve({ nome: null, observacoes: null }); return; }

    const body = new URLSearchParams({
      apikey:            apiKey,
      language:          "por",
      OCREngine:         "2",
      detectOrientation: "true",
      scale:             "true",
      isTable:           "false",
      base64Image:       `data:image/jpeg;base64,${buffer.toString("base64")}`,
    }).toString();

    const req = https.request({
      hostname: "api.ocr.space",
      path:     "/parse/image",
      method:   "POST",
      headers:  { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
      timeout:  30000,
    }, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.IsErroredOnProcessing) {
            process.stdout.write(` [OCR-erro:${String(json.ErrorMessage?.[0]).slice(0, 30)}]`);
            resolve({ nome: null, observacoes: null }); return;
          }
          const text = (json.ParsedResults?.[0]?.ParsedText ?? "").trim();
          if (text.length > 0) process.stdout.write(` [OCR:${text.length}c]`);
          resolve(parseOcrText(text));
        } catch { resolve({ nome: null, observacoes: null }); }
      });
    });
    req.on("error",   () => resolve({ nome: null, observacoes: null }));
    req.on("timeout", () => { req.destroy(); resolve({ nome: null, observacoes: null }); });
    req.write(body);
    req.end();
  });
}

// Interpreta o texto extraído pelo OCR do Google Drive.
// Formato esperado (editado na foto):
//   NOME COMPLETO
//   GN:NOME DA MÃE
//   DN:DD/MM/AAAA
//   VULGO:APELIDO  (opcional)
// Suporta dois formatos encontrados nas fotos:
//   Formato A (abordagem): "NOME COMPLETO\nGN:MÃE\nDN:DD/MM/AAAA"
//   Formato B (ficha):     "Nome NOME\nMãe MÃE\nData Nascimento DD/MM/AAAA"
function parseOcrText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let nome = null, genitora = null, nascimento = null, vulgo = null, cpf = null;

  for (const line of lines) {
    // Genitora — formato A: "GN:" | formato B: "Mãe " / "Mae "
    if (/^GN\s*[:\-]/i.test(line)) {
      genitora = line.replace(/^GN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^M(?:ã|a)e\s+/i.test(line)) {
      genitora = line.replace(/^M(?:ã|a)e\s+/i, "").trim() || null;

    // Nascimento — formato A: "DN:" | formato B: "Data Nascimento " / "Nascimento "
    } else if (/^DN\s*[:\-]/i.test(line)) {
      nascimento = line.replace(/^DN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^(?:Data\s+)?Nascimento\s*[:\s]/i.test(line)) {
      nascimento = line.replace(/^(?:Data\s+)?Nascimento\s*[:\s]\s*/i, "").trim() || null;

    // Vulgo
    } else if (/^(?:VULGO|VG)\s*[:\-]/i.test(line)) {
      vulgo = line.replace(/^(?:VULGO|VG)\s*[:\-]\s*/i, "").trim() || null;

    // CPF
    } else if (/^CPF\s*[:\-]/i.test(line)) {
      cpf = line.replace(/^CPF\s*[:\-]\s*/i, "").trim() || null;

    // Nome — formato A: linha toda maiúscula sem prefixo
    //         formato B: prefixo "Nome "
    } else if (/^Nome\s+/i.test(line)) {
      nome = line.replace(/^Nome\s+/i, "").trim() || null;
    } else if (!nome && line.length > 3 && /^[A-ZÁÀÃÂÉÊÍÓÕÔÚÇ][A-ZÁÀÃÂÉÊÍÓÕÔÚÇ\s]+$/.test(line)) {
      nome = line;
    }
  }

  const observacoes = lines.join("\n") || null;
  return { nome, genitora, nascimento, vulgo, cpf, observacoes };
}

// ── Embedding facial ──────────────────────────────────────────────────────────
function embedFace(buffer) {
  return new Promise((resolve) => {
    const req = https.request(`${FACE_URL}/embed-raw`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", "Content-Length": buffer.length },
      timeout: 30000,
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({ count: 0, faces: [] }); } });
    });
    req.on("error", () => resolve({ count: 0, faces: [] }));
    req.on("timeout", () => { req.destroy(); resolve({ count: 0, faces: [] }); });
    req.write(buffer);
    req.end();
  });
}

// ── Processar um arquivo ──────────────────────────────────────────────────────
async function processFile(file) {
  // Checa duplicata no banco
  const { data: existing } = await sb.from("qualificados")
    .select("id").eq("fonte", "drive").eq("fonte_id", file.file_id).maybeSingle();
  if (existing) return "skip";

  // Download (necessário para OCR + Storage + embedding)
  let buffer;
  try {
    const res = await drive.files.get({ fileId: file.file_id, alt: "media" }, { responseType: "arraybuffer" });
    buffer = Buffer.from(res.data);
  } catch { return "erro_download"; }

  // OCR via OCR.space — envia buffer como base64, sem criar nada no Drive
  const dados = await ocr(buffer);

  // Sem texto extraído da foto — não importa
  if (!dados.observacoes) return "sem_dados";

  // Nome: campo detectado pelo parser ou primeira linha do texto
  const nomeImport = dados.nome
    ?? dados.observacoes.split("\n").find(l => l.trim().length > 2)?.trim();

  // Upload Storage
  const storagePath = `drive/${file.file_id}/${file.file_name}`;
  const { error: upErr } = await sb.storage.from("faces").upload(storagePath, buffer, {
    contentType: file.mime_type, upsert: true,
  });
  if (upErr) return "erro_storage";

  const { data: { publicUrl } } = sb.storage.from("faces").getPublicUrl(storagePath);

  // Insert qualificado
  const { data: q, error: insErr } = await sb.from("qualificados").insert({
    nome: nomeImport, vulgo: dados.vulgo ?? null, cpf: dados.cpf ?? null,
    nascimento: dados.nascimento ?? null, genitora: dados.genitora ?? null,
    observacoes: dados.observacoes ?? null,
    foto_url: publicUrl, fonte: "drive", fonte_id: file.file_id,
  }).select("id").single();
  if (insErr || !q) return "erro_insert";

  // Embedding facial
  try {
    const embed = await embedFace(buffer);
    if (embed.count > 0) {
      for (let i = 0; i < embed.faces.length; i++) {
        const face = embed.faces[i];
        await sb.from("face_embeddings").insert({
          source: "qualificados", source_id: q.id, source_label: dados.nome,
          photo_url: publicUrl, embedding: JSON.stringify(face.embedding),
          bbox: face.bbox, det_score: face.det_score, face_index: i,
        });
      }
    } else {
      await sb.from("face_skipped").upsert({
        source: "qualificados", source_id: q.id, source_label: dados.nome,
        reason: "no_face_detected",
      }, { onConflict: "source,source_id" });
    }
  } catch { /* Railway indisponível — importa sem embedding */ }

  return `ok:${dados.nome}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Drive Import ===");

  // Verifica se fila existe e tem itens
  const { count: total, error: tblErr } = await sb
    .from("drive_import_queue").select("*", { count: "exact", head: true });

  if (tblErr) {
    console.error("Tabela drive_import_queue não encontrada. Execute a migration 008 no Supabase.");
    process.exit(1);
  }

  if (!total || total === 0) {
    await populateQueue();
  }

  // Busca próximos pendentes
  const { data: pending, count: pendingCount } = await sb
    .from("drive_import_queue")
    .select("file_id, file_name, mime_type", { count: "exact" })
    .eq("done", false)
    .limit(BATCH_SIZE);

  const { count: doneCount } = await sb
    .from("drive_import_queue").select("*", { count: "exact", head: true }).eq("done", true);

  console.log(`Pendentes: ${pendingCount} | Concluídas: ${doneCount} | Total: ${total}`);
  console.log(`Processando ${pending?.length ?? 0} fotos nesta rodada...\n`);

  if (!pending?.length) {
    console.log("Importação completa!");
    return;
  }

  let imported = 0, skipped = 0, sem_dados = 0, erros = 0;

  for (let i = 0; i < pending.length; i++) {
    const file = pending[i];
    const result = await processFile(file);

    // Marca como concluído na fila
    await sb.from("drive_import_queue").update({ done: true }).eq("file_id", file.file_id);

    if (result === "skip") skipped++;
    else if (result === "sem_dados") sem_dados++;
    else if (result.startsWith("erro")) erros++;
    else imported++;

    const pct = (((doneCount + i + 1) / total) * 100).toFixed(1);
    process.stdout.write(
      `[${doneCount + i + 1}/${total}] ${pct}% | +${imported} importadas | ${skipped} skip | ${sem_dados} sem dados | ${erros} erros   \r`
    );
  }

  console.log(`\n\nRodada concluída:`);
  console.log(`  Importadas : ${imported}`);
  console.log(`  Já existiam: ${skipped}`);
  console.log(`  Sem dados  : ${sem_dados}`);
  console.log(`  Erros      : ${erros}`);
  console.log(`  Progresso  : ${doneCount + pending.length}/${total} (${(((doneCount + pending.length) / total) * 100).toFixed(1)}%)`);
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
