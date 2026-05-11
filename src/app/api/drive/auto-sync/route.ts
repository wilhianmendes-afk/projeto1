import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { embedImage } from "@/lib/face-service";
import Anthropic from "@anthropic-ai/sdk";

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

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

async function extractDataFromPhoto(buffer: Buffer, mimeType: string) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const validMime = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
      ? mimeType : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: validMime, data: buffer.toString("base64") } },
          { type: "text", text: `Extraia os dados pessoais visíveis nesta foto. Retorne APENAS um JSON com os campos encontrados. Campos: nome (nome completo), vulgo (apelido), cpf (xxx.xxx.xxx-xx), nascimento (DD/MM/AAAA), genitora (nome da mãe). Use null para não encontrados. Responda SOMENTE com o JSON, sem markdown.` },
        ],
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
    return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    return { nome: null, vulgo: null, cpf: null, nascimento: null, genitora: null };
  }
}

async function syncFolder(
  drive: ReturnType<typeof getDriveClient>,
  supabase: ReturnType<typeof getAdminClient>,
  folderId: string,
  lastSyncedAt: Date | null
): Promise<{ imported: number; skipped: number; sem_dados: number }> {
  let imported = 0, skipped = 0, sem_dados = 0;

  // Filtra por arquivos criados depois do último sync
  const timeFilter = lastSyncedAt
    ? ` and createdTime > '${lastSyncedAt.toISOString()}'`
    : "";

  const { data: { publicUrl: storageBase } } = supabase.storage.from("faces").getPublicUrl("_dummy");
  const bucketBase = storageBase.replace("/_dummy", "");

  let pageToken: string | undefined;
  do {
    const { data: listRes } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false${timeFilter}`,
      fields: "nextPageToken, files(id, name, mimeType, createdTime)",
      pageSize: 50,
      pageToken,
      orderBy: "createdTime asc",
    });

    for (const file of listRes?.files ?? []) {
      if (!file.id || !file.name) continue;

      // Checa se já foi importado
      const { data: existing } = await supabase
        .from("qualificados")
        .select("id")
        .eq("fonte", "drive")
        .eq("fonte_id", file.id)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Baixa a imagem
      const dlRes = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(dlRes.data as ArrayBuffer);

      // OCR via Claude Haiku
      const dados = await extractDataFromPhoto(buffer, file.mimeType ?? "image/jpeg");
      if (!dados.nome) { sem_dados++; continue; }

      // Upload para Storage
      const storagePath = `drive/${file.id}/${file.name}`;
      await supabase.storage.from("faces").upload(storagePath, buffer, {
        contentType: file.mimeType ?? "image/jpeg",
        upsert: true,
      });
      const photoUrl = `${bucketBase}/${storagePath}`;

      // Insere qualificado
      const { data: qualificado } = await supabase
        .from("qualificados")
        .insert({
          nome: dados.nome,
          vulgo: dados.vulgo ?? null,
          cpf: dados.cpf ?? null,
          nascimento: dados.nascimento ?? null,
          genitora: dados.genitora ?? null,
          foto_url: photoUrl,
          fonte: "drive",
          fonte_id: file.id,
        })
        .select("id")
        .single();

      if (!qualificado) continue;

      // Indexação facial
      try {
        const embedResponse = await embedImage(buffer, file.name);
        if (embedResponse.count > 0) {
          for (let i = 0; i < embedResponse.faces.length; i++) {
            const face = embedResponse.faces[i];
            await supabase.from("face_embeddings").insert({
              source: "qualificados",
              source_id: qualificado.id,
              source_label: dados.nome,
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

    pageToken = listRes?.nextPageToken ?? undefined;
  } while (pageToken);

  return { imported, skipped, sem_dados };
}

export async function POST(req: NextRequest) {
  // Autenticação: Vercel Cron ou token manual
  const auth = req.headers.get("authorization");
  const isCron = req.headers.get("x-vercel-cron") === "1";
  if (!isCron && auth !== `Bearer ${IBIS_TOKEN}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Google Drive não configurado. Configure GOOGLE_REFRESH_TOKEN nas env vars." }, { status: 503 });
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
