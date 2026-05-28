import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { listBQFolderFiles, getBQDriveClient, hasBQDriveConfig, ocrImageBuffer } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FONTE = "drive_bq";
const INGEST_SOURCE = "drive_bq_ingest"; // rastro no face_skipped para arquivos já avaliados
const DEFAULT_BATCH = 5;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function listAllImages(folderId: string): Promise<{ id: string; name: string }[]> {
  const files = await listBQFolderFiles(folderId, "id, name, mimeType");
  return files.filter(f => f.mimeType.startsWith("image/")).map(f => ({ id: f.id, name: f.name || f.id }));
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-import-token");
  const cronHeader = req.headers.get("x-vercel-cron");
  if (token !== process.env.IBIS_IMPORT_TOKEN && !cronHeader) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!hasBQDriveConfig()) {
    return NextResponse.json({ error: "OAuth2 BQ não configurado" }, { status: 400 });
  }
  const folderId = process.env.DRIVE_BQ_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "DRIVE_BQ_FOLDER_ID não configurado" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize: number = Number(body.limit ?? DEFAULT_BATCH);
  const db = getAdminClient();

  // IDs já avaliados por este pipeline (inseridos ou descartados)
  const [{ data: jaQualificados }, { data: jaSkipped }] = await Promise.all([
    db.from("qualificados").select("fonte_id").eq("fonte", FONTE).not("fonte_id", "is", null),
    db.from("face_skipped").select("source_id").eq("source", INGEST_SOURCE),
  ]);
  const done = new Set([
    ...(jaQualificados ?? []).map((r: { fonte_id: string }) => r.fonte_id),
    ...(jaSkipped ?? []).map((r: { source_id: string }) => r.source_id),
  ]);

  let allFiles: { id: string; name: string }[] = [];
  try {
    allFiles = await listAllImages(folderId);
  } catch (err) {
    return NextResponse.json({ error: "Erro ao listar Drive: " + String(err) }, { status: 500 });
  }

  const pending = allFiles.filter((f) => !done.has(f.id)).slice(0, batchSize);
  const remaining = allFiles.filter((f) => !done.has(f.id)).length - pending.length;

  let inserted = 0;
  let skipped_dup = 0;
  let skipped_no_ocr = 0;
  const errors: string[] = [];
  const drive = getBQDriveClient();

  for (const file of pending) {
    try {
      // Download
      const dlRes = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(dlRes.data as ArrayBuffer);

      // OCR
      const ocr = await ocrImageBuffer(buffer);
      const { nome, cpf, vulgo, genitora, nascimento, observacoes } = ocr;

      if (!nome) {
        // Sem nome extraído — sem dados para criar ficha
        await db.from("face_skipped").upsert(
          { source: INGEST_SOURCE, source_id: file.id, source_label: file.name, reason: "no_ocr" },
          { onConflict: "source,source_id" }
        );
        skipped_no_ocr++;
        continue;
      }

      // Dedup por CPF
      if (cpf) {
        const { data: byCpf } = await db
          .from("qualificados")
          .select("id")
          .eq("cpf", cpf.trim())
          .is("deleted_at", null)
          .limit(1);
        if (byCpf?.length) {
          await cleanupDriveBq(db, file.id);
          await db.from("face_skipped").upsert(
            { source: INGEST_SOURCE, source_id: file.id, source_label: file.name, reason: "duplicate_cpf" },
            { onConflict: "source,source_id" }
          );
          skipped_dup++;
          continue;
        }
      }

      // Dedup por nome + nascimento
      if (nome && nascimento) {
        const { data: byNome } = await db
          .from("qualificados")
          .select("id")
          .ilike("nome", nome.trim())
          .eq("nascimento", nascimento.trim())
          .is("deleted_at", null)
          .limit(1);
        if (byNome?.length) {
          await cleanupDriveBq(db, file.id);
          await db.from("face_skipped").upsert(
            { source: INGEST_SOURCE, source_id: file.id, source_label: file.name, reason: "duplicate_nome" },
            { onConflict: "source,source_id" }
          );
          skipped_dup++;
          continue;
        }
      }

      // Upload para Storage
      const storagePath = `drive_bq/${file.id}.jpg`;
      const { error: upErr } = await db.storage
        .from("faces")
        .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
      if (upErr) {
        errors.push(`${file.name}: storage: ${upErr.message}`);
        continue;
      }
      const { data: { publicUrl } } = db.storage.from("faces").getPublicUrl(storagePath);

      // Inserir qualificado
      const { error: insErr } = await db.from("qualificados").insert({
        nome: nome.trim(),
        vulgo: vulgo ?? null,
        cpf: cpf?.trim() ?? null,
        genitora: genitora?.trim() ?? null,
        nascimento: nascimento?.trim() ?? null,
        foto_url: publicUrl,
        observacoes: observacoes ?? null,
        fonte: FONTE,
        fonte_id: file.id,
      });
      if (insErr) {
        errors.push(`${file.name}: insert: ${insErr.message}`);
        continue;
      }

      // Remove entradas drive_bq antigas para este file_id:
      // o worker do Railway vai gerar o embedding sob source='qualificados'
      await cleanupDriveBq(db, file.id);
      inserted++;
    } catch (err) {
      errors.push(`${file.name}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: pending.length,
    inserted,
    skipped_dup,
    skipped_no_ocr,
    remaining: Math.max(0, remaining),
    errors: errors.length ? errors : undefined,
  });
}

async function cleanupDriveBq(
  db: ReturnType<typeof getAdminClient>,
  fileId: string
) {
  await Promise.all([
    db.from("face_embeddings").delete().eq("source", "drive_bq").eq("source_id", fileId),
    db.from("face_skipped").delete().eq("source", "drive_bq").eq("source_id", fileId),
  ]);
}
