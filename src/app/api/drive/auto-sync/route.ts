import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";
import { getDriveClient, ocrDriveFile } from "@/lib/google-drive";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IBIS_TOKEN = process.env.IBIS_IMPORT_TOKEN;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}


async function listAllImages(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  timeFilter: string
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const files: Array<{ id: string; name: string; mimeType: string }> = [];

  // Imagens diretas nesta pasta
  let pageToken: string | undefined;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false${timeFilter}`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
    });
    for (const f of data?.files ?? []) {
      if (f.id && f.name) files.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? "image/jpeg" });
    }
    pageToken = data?.nextPageToken ?? undefined;
  } while (pageToken);

  // Subpastas — recursão
  const { data: subData } = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 100,
  });
  for (const sub of subData?.files ?? []) {
    if (sub.id) {
      const subFiles = await listAllImages(drive, sub.id, timeFilter);
      files.push(...subFiles);
    }
  }

  return files;
}

async function syncFolder(
  drive: ReturnType<typeof getDriveClient>,
  supabase: ReturnType<typeof getAdminClient>,
  folderId: string,
  lastSyncedAt: Date | null
): Promise<{ imported: number; skipped: number; sem_dados: number }> {
  let imported = 0, skipped = 0, sem_dados = 0;

  const timeFilter = lastSyncedAt
    ? ` and createdTime > '${lastSyncedAt.toISOString()}'`
    : "";

  const { data: { publicUrl: storageBase } } = supabase.storage.from("faces").getPublicUrl("_dummy");
  const bucketBase = storageBase.replace("/_dummy", "");

  const allFiles = await listAllImages(drive, folderId, timeFilter);

  for (const file of allFiles) {
    const { data: existing } = await supabase
      .from("qualificados")
      .select("id")
      .eq("fonte", "drive")
      .eq("fonte_id", file.id)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // OCR via Google Drive (antes do download — evita baixar fotos sem dados)
    const dados = await ocrDriveFile(drive, file.id);

    const nomeImport = dados.nome
      ?? dados.observacoes?.split("\n").find(l => l.trim().length > 2)?.trim()
      ?? file.name.replace(/\.[^.]+$/, "");

    if (!nomeImport) { sem_dados++; continue; }

    const dlRes = await drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(dlRes.data as ArrayBuffer);

    const storagePath = `drive/${file.id}/${file.name}`;
    await supabase.storage.from("faces").upload(storagePath, buffer, {
      contentType: file.mimeType,
      upsert: true,
    });
    const photoUrl = `${bucketBase}/${storagePath}`;

    const { data: qualificado } = await supabase
      .from("qualificados")
      .insert({
        nome: nomeImport,
        vulgo: dados.vulgo ?? null,
        cpf: dados.cpf ?? null,
        nascimento: dados.nascimento ?? null,
        genitora: dados.genitora ?? null,
        observacoes: dados.observacoes ?? null,
        foto_url: photoUrl,
        fonte: "drive",
        fonte_id: file.id,
      })
      .select("id")
      .single();

    if (!qualificado) continue;

    try {
      const embedResponse = await embedImage(buffer, file.name);
      if (embedResponse.count > 0) {
        for (let i = 0; i < embedResponse.faces.length; i++) {
          const face = embedResponse.faces[i];
          await supabase.from("face_embeddings").insert({
            source: "qualificados",
            source_id: qualificado.id,
            source_label: nomeImport,
            photo_url: photoUrl,
            embedding: JSON.stringify(face.embedding),
            bbox: face.bbox,
            det_score: face.det_score,
            face_index: i,
          });
        }
      } else {
        await supabase.from("face_skipped").upsert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: dados.nome,
          reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
      }
    } catch { /* face service indisponível, importa sem embedding */ }

    imported++;
  }

  return { imported, skipped, sem_dados };
}

export async function POST(req: NextRequest) {
  // Autenticação: Vercel Cron ou token manual
  const auth = req.headers.get("authorization");
  const isCron = req.headers.get("x-vercel-cron") === "1";
  if (!isCron && auth !== `Bearer ${IBIS_TOKEN}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ error: "Google Drive não configurado. Configure GOOGLE_SERVICE_ACCOUNT_KEY nas env vars." }, { status: 503 });
  }

  const supabase = getAdminClient();
  const drive = getDriveClient();

  // Busca pastas ativas
  const { data: folders } = await supabase
    .from("drive_sync_folders")
    .select("id, folder_id, folder_name, last_synced_at, total_imported")
    .eq("active", true);

  if (!folders?.length) {
    return NextResponse.json({ ok: true, message: "Nenhuma pasta configurada." });
  }

  const results: Array<{ folder_id: string; imported?: number; skipped?: number; sem_dados?: number; error?: string }> = [];

  for (const folder of folders) {
    const lastSynced = folder.last_synced_at ? new Date(folder.last_synced_at) : null;

    try {
      // Tenta pegar o nome da pasta no Drive se não tiver
      if (!folder.folder_name) {
        try {
          const meta = await drive.files.get({ fileId: folder.folder_id, fields: "name" });
          await supabase.from("drive_sync_folders").update({ folder_name: meta.data.name }).eq("id", folder.id);
        } catch { /* ignora */ }
      }

      const { imported, skipped, sem_dados } = await syncFolder(drive, supabase, folder.folder_id, lastSynced);

      // Atualiza last_synced_at
      await supabase.from("drive_sync_folders").update({
        last_synced_at: new Date().toISOString(),
        total_imported: (folder.total_imported ?? 0) + imported,
      }).eq("id", folder.id);

      results.push({ folder_id: folder.folder_id, imported, skipped, sem_dados });
    } catch (err) {
      results.push({ folder_id: folder.folder_id, error: String(err) });
    }
  }

  const totalImported = results.reduce((s, r) => s + (r.imported ?? 0), 0);
  return NextResponse.json({ ok: true, folders: results, total_imported: totalImported });
}
