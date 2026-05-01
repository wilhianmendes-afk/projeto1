import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { embedImage } from "@/lib/face-service";

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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { folderId } = await req.json();
  if (!folderId) return NextResponse.json({ error: "folderId obrigatório" }, { status: 400 });

  const drive = getDriveClient();
  const service = await createServiceClient();

  let pageToken: string | undefined;
  let imported = 0;
  let skipped = 0;

  const { data: { publicUrl: storageBase } } = service.storage
    .from("faces")
    .getPublicUrl("_dummy");
  const bucketBase = storageBase.replace("/_dummy", "");

  do {
    const { data: listRes } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 50,
      pageToken,
    });

    const files = listRes?.files ?? [];
    pageToken = listRes?.nextPageToken ?? undefined;

    for (const file of files) {
      if (!file.id || !file.name) continue;

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

      const storagePath = `drive/${file.id}/${file.name}`;
      await service.storage.from("faces").upload(storagePath, buffer, {
        contentType: file.mimeType ?? "image/jpeg",
        upsert: true,
      });
      const photoUrl = `${bucketBase}/${storagePath}`;

      const nome = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();

      const { data: qualificado } = await service
        .from("qualificados")
        .insert({ nome, foto_url: photoUrl, fonte: "drive", fonte_id: file.id })
        .select("id")
        .single();

      if (!qualificado) continue;

      let embedResponse;
      try {
        embedResponse = await embedImage(buffer, file.name);
      } catch {
        skipped++;
        continue;
      }

      if (embedResponse.count === 0) {
        await service.from("face_skipped").upsert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: nome,
          reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
        skipped++;
        continue;
      }

      for (let faceIndex = 0; faceIndex < embedResponse.faces.length; faceIndex++) {
        const face = embedResponse.faces[faceIndex];
        await service.from("face_embeddings").insert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: nome,
          photo_url: photoUrl,
          embedding: JSON.stringify(face.embedding),
          bbox: face.bbox,
          det_score: face.det_score,
          face_index: faceIndex,
        });
      }

      imported++;
    }
  } while (pageToken);

  return NextResponse.json({ ok: true, imported, skipped });
}
