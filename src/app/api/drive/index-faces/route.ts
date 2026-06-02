import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { listBQFolderPage, getBQDriveClient, hasBQDriveConfig, type DriveCursor } from "@/lib/google-drive";
import { embedImage } from "@/lib/face-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE = "drive_bq";
const DRIVE_PAGE_SIZE = 100;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-import-token");
  const cronHeader = req.headers.get("x-vercel-cron");
  if (token !== process.env.IBIS_IMPORT_TOKEN && !cronHeader) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!hasBQDriveConfig()) {
    return NextResponse.json({ error: "Credenciais OAuth2 do BQ não configuradas" }, { status: 400 });
  }

  const folderId = process.env.DRIVE_BQ_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "DRIVE_BQ_FOLDER_ID não configurado" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const batchLimit: number = body.limit ?? 5;
  const cursor: DriveCursor | null = body.cursor ?? null;

  const db = getAdminClient();

  // Busca UMA página de arquivos do Drive (sem listar tudo)
  let pageFiles: Array<{ id: string; name: string; mimeType: string }>;
  let nextCursor: DriveCursor | null;
  try {
    ({ files: pageFiles, nextCursor } = await listBQFolderPage(folderId, DRIVE_PAGE_SIZE, cursor));
  } catch (err) {
    return NextResponse.json({ error: "Erro ao listar Drive: " + String(err) }, { status: 500 });
  }

  const imageFiles = pageFiles.filter(f => f.mimeType.startsWith("image/"));

  if (imageFiles.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, embedded: 0, skipped: 0, nextCursor, done: nextCursor === null });
  }

  // Checa apenas os IDs desta página contra Supabase — sem limite de 1000 linhas
  const fileIds = imageFiles.map(f => f.id);
  const [{ data: indexed }, { data: alreadySkipped }] = await Promise.all([
    db.from("face_embeddings").select("source_id").eq("source", SOURCE).in("source_id", fileIds),
    db.from("face_skipped").select("source_id").eq("source", SOURCE).in("source_id", fileIds),
  ]);
  const indexedIds = new Set([
    ...(indexed ?? []).map((r: { source_id: string }) => r.source_id),
    ...(alreadySkipped ?? []).map((r: { source_id: string }) => r.source_id),
  ]);

  const pending = imageFiles.filter(f => !indexedIds.has(f.id)).slice(0, batchLimit);

  let embedded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of pending) {
    try {
      const drive = getBQDriveClient();
      const res = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);

      let result = await embedImage(buffer, file.name);
      if (result.count === 0 && result.total_detected > 0) {
        result = await embedImage(buffer, file.name, 0.35);
      }

      if (result.count === 0) {
        await db.from("face_skipped").upsert(
          { source: SOURCE, source_id: file.id, source_label: file.name, reason: "no_face_detected" },
          { onConflict: "source,source_id" }
        );
        skipped++;
        continue;
      }

      for (let i = 0; i < result.faces.length; i++) {
        const face = result.faces[i];
        await db.from("face_embeddings").upsert(
          {
            source:       SOURCE,
            source_id:    file.id,
            source_label: file.name,
            photo_url:    file.id,
            embedding:    JSON.stringify(face.embedding),
            bbox:         face.bbox,
            det_score:    face.det_score,
            face_index:   i,
          },
          { onConflict: "source,source_id,photo_url,face_index" }
        );
      }
      embedded += result.count;
    } catch (err) {
      errors.push(`${file.name}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: pending.length,
    embedded,
    skipped,
    nextCursor,
    done: nextCursor === null,
    errors: errors.length ? errors : undefined,
  });
}
