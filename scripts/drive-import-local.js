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
 *   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, FACE_SERVICE_URL
 */

const dotenv = require("dotenv");
dotenv.config({ path: require("path").join(__dirname, "../.env.local") });

const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk").default;
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
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const driveAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
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

// ── OCR ───────────────────────────────────────────────────────────────────────
async function ocr(buffer, mimeType) {
  const validMime = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
    ? mimeType : "image/jpeg";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: validMime, data: buffer.toString("base64") } },
          { type: "text", text: "Extraia os dados pessoais visíveis nesta foto. Retorne APENAS um JSON com os campos encontrados. Campos: nome (nome completo), vulgo (apelido), cpf (xxx.xxx.xxx-xx), nascimento (DD/MM/AAAA), genitora (nome da mãe). Use null para não encontrados. Responda SOMENTE com o JSON, sem markdown." },
        ],
      }],
    });
    const text = msg.content[0]?.text?.trim() || "{}";
    return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    return { nome: null };
  }
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

  // Download
  let buffer;
  try {
    const res = await drive.files.get({ fileId: file.file_id, alt: "media" }, { responseType: "arraybuffer" });
    buffer = Buffer.from(res.data);
  } catch { return "erro_download"; }

  // OCR
  const dados = await ocr(buffer, file.mime_type);
  if (!dados.nome) return "sem_dados";

  // Upload Storage
  const storagePath = `drive/${file.file_id}/${file.file_name}`;
  const { error: upErr } = await sb.storage.from("faces").upload(storagePath, buffer, {
    contentType: file.mime_type, upsert: true,
  });
  if (upErr) return "erro_storage";

  const { data: { publicUrl } } = sb.storage.from("faces").getPublicUrl(storagePath);

  // Insert qualificado
  const { data: q, error: insErr } = await sb.from("qualificados").insert({
    nome: dados.nome, vulgo: dados.vulgo ?? null, cpf: dados.cpf ?? null,
    nascimento: dados.nascimento ?? null, genitora: dados.genitora ?? null,
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
