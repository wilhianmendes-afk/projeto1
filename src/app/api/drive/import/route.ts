import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { embedImage } from "@/lib/face-service";
import Anthropic from "@anthropic-ai/sdk";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const maxDuration = 300;

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

type ExtractedData = {
  nome: string | null;
  vulgo: string | null;
  cpf: string | null;
  nascimento: string | null;
  genitora: string | null;
};

async function extractDataFromPhoto(buffer: Buffer, mimeType: string): Promise<ExtractedData> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const validMime = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
      ? mimeType
      : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: validMime, data: buffer.toString("base64") },
          },
          {
            type: "text",
            text: `Extraia os dados pessoais visíveis nesta foto. Retorne APENAS um JSON com os campos encontrados. Campos: nome (nome completo da pessoa), vulgo (apelido ou alcunha), cpf (formato xxx.xxx.xxx-xx), nascimento (formato DD/MM/AAAA), genitora (nome da mãe). Use null para campos não encontrados. Responda SOMENTE com o JSON, sem markdown.`,
          },
        ],
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { nome: null, vulgo: null, cpf: null, nascimento: null, genitora: null };
  }
}

async function listImagesInFolder(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  recursive: boolean
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const images: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken: string | undefined;

  do {
    const { data: listRes } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
    });

    for (const file of listRes?.files ?? []) {
      if (!file.id || !file.name) continue;
      if (file.mimeType === "application/vnd.google-apps.folder" && recursive) {
        const sub = await listImagesInFolder(drive, file.id, recursive);
        images.push(...sub);
      } else if (file.mimeType?.includes("image/")) {
        images.push({ id: file.id, name: file.name, mimeType: file.mimeType });
      }
    }

    pageToken = listRes?.nextPageToken ?? undefined;
  } while (pageToken);

  return images;
}

export async function POST(req: NextRequest) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { folderIds, recursive = true } = await req.json();
  const ids: string[] = Array.isArray(folderIds)
    ? folderIds.filter(Boolean)
    : typeof folderIds === "string" ? [folderIds].filter(Boolean) : [];

  if (!ids.length) return NextResponse.json({ error: "Nenhum ID fornecido" }, { status: 400 });

  const drive = getDriveClient();
  const service = getAdminClient();

  const { data: { publicUrl: storageBase } } = service.storage.from("faces").getPublicUrl("_dummy");
  const bucketBase = storageBase.replace("/_dummy", "");

  let imported = 0, skipped = 0, sem_dados = 0;

  for (const entryId of ids) {
    // Detecta se é arquivo ou pasta
    const meta = await drive.files.get({ fileId: entryId, fields: "id,name,mimeType" });
    const isFolder = meta.data.mimeType === "application/vnd.google-apps.folder";

    const files = isFolder
      ? await listImagesInFolder(drive, entryId, recursive)
      : meta.data.mimeType?.includes("image/")
        ? [{ id: meta.data.id!, name: meta.data.name!, mimeType: meta.data.mimeType! }]
        : [];

    for (const file of files) {
      const { data: existing } = await service
        .from("qualificados")
        .select("id")
        .eq("fonte", "drive")
        .eq("fonte_id", file.id)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const dlRes = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(dlRes.data as ArrayBuffer);

      const dados = await extractDataFromPhoto(buffer, file.mimeType);
      if (!dados.nome) { sem_dados++; continue; }

      const storagePath = `drive/${file.id}/${file.name}`;
      await service.storage.from("faces").upload(storagePath, buffer, {
        contentType: file.mimeType ?? "image/jpeg",
        upsert: true,
      });
      const photoUrl = `${bucketBase}/${storagePath}`;

      const { data: qualificado } = await service
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

      let embedResponse;
      try {
        embedResponse = await embedImage(buffer, file.name);
      } catch {
        imported++;
        continue;
      }

      if (embedResponse.count === 0) {
        await service.from("face_skipped").upsert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: dados.nome,
          reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
        imported++;
        continue;
      }

      for (let faceIndex = 0; faceIndex < embedResponse.faces.length; faceIndex++) {
        const face = embedResponse.faces[faceIndex];
        await service.from("face_embeddings").insert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: dados.nome,
          photo_url: photoUrl,
          embedding: JSON.stringify(face.embedding),
          bbox: face.bbox,
          det_score: face.det_score,
          face_index: faceIndex,
        });
      }

      imported++;
    }
  }

  return NextResponse.json({ ok: true, imported, skipped, sem_dados });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
