import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getBQDriveClient, hasBQDriveConfig } from "@/lib/google-drive";
import { embedImage } from "@/lib/face-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE = "drive_bq";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Lista todas as imagens de uma pasta e subpastas (BFS, máx 500 arquivos por chamada)
async function listAllImages(folderId: string): Promise<{ id: string; name: string }[]> {
  const drive = getBQDriveClient();
  const images: { id: string; name: string }[] = [];
  const queue = [folderId];

  while (queue.length > 0 && images.length < 500) {
    const currentFolder = queue.shift()!;

    let pageToken: string | undefined;
    do {
      const { data } = await drive.files.list({
        q: `'${currentFolder}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const f of data.files ?? []) {
        if (!f.id) continue;
        if (f.mimeType === "application/vnd.google-apps.folder") {
          queue.push(f.id);
        } else if (f.mimeType?.startsWith("image/")) {
          images.push({ id: f.id, name: f.name ?? "sem_nome" });
        }
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return images;
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
  const batchLimit: number = body.limit ?? 30;

  const db = getAdminClient();

  // IDs já indexados ou já marcados como sem rosto
  const [{ data: indexed }, { data: skipped }] = await Promise.all([
    db.from("face_embeddings").select("source_id").eq("source", SOURCE),
    db.from("face_skipped").select("source_id").eq("source", SOURCE),
  ]);
  const indexedIds = new Set([
    ...(indexed ?? []).map((r: { source_id: string }) => r.source_id),
    ...(skipped ?? []).map((r: { source_id: string }) => r.source_id),
  ]);

  // Listar arquivos do Drive
  let allFiles: { id: string; name: string }[] = [];
  try {
    allFiles = await listAllImages(folderId);
  } catch (err) {
    return NextResponse.json({ error: "Erro ao listar Drive: " + String(err) }, { status: 500 });
  }

  const pending = allFiles.filter((f) => !indexedIds.has(f.id)).slice(0, batchLimit);

  let embedded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of pending) {
    try {
      // Download do Drive
      const drive = getBQDriveClient();
      const res = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);

      // Gerar embedding
      let result = await embedImage(buffer, file.name);
      if (result.count === 0 && result.total_detected > 0) {
        result = await embedImage(buffer, file.name, 0.35);
      }

      if (result.count === 0) {
        // Sem rosto — registra como skipped para não reprocessar
        await db.from("face_skipped").upsert(
          { source: SOURCE, source_id: file.id, source_label: file.name, reason: "no_face_detected" },
          { onConflict: "source,source_id" }
        );
        skipped++;
        continue;
      }

      // Inserir embeddings
      for (let i = 0; i < result.faces.length; i++) {
        const face = result.faces[i];
        await db.from("face_embeddings").upsert(
          {
            source:       SOURCE,
            source_id:    file.id,
            source_label: file.name,
            photo_url:    file.id,   // ID usado pelo proxy /api/drive/photo/[id]
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

  const remaining = allFiles.filter((f) => !indexedIds.has(f.id)).length - pending.length;

  return NextResponse.json({
    ok: true,
    processed: pending.length,
    embedded,
    skipped,
    remaining: Math.max(0, remaining),
    errors: errors.length ? errors : undefined,
  });
}
