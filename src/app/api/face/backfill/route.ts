import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedImage } from "@/lib/face-service";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const service = await createServiceClient();

  const { data: alreadyIndexed } = await service
    .from("face_embeddings")
    .select("source_id")
    .eq("source", "qualificados");

  const { data: alreadySkipped } = await service
    .from("face_skipped")
    .select("source_id")
    .eq("source", "qualificados");

  const done = new Set([
    ...(alreadyIndexed ?? []).map((r: { source_id: string }) => r.source_id),
    ...(alreadySkipped ?? []).map((r: { source_id: string }) => r.source_id),
  ]);

  const { data: pendentes } = await service
    .from("qualificados")
    .select("id, nome, foto_url, fotos_extras")
    .is("deleted_at", null)
    .not("foto_url", "is", null);

  const queue = (pendentes ?? []).filter((p: { id: string }) => !done.has(p.id));

  let processed = 0;
  let embedded = 0;
  let skipped = 0;

  for (const pessoa of queue) {
    const urls: string[] = [
      pessoa.foto_url,
      ...((pessoa.fotos_extras as string[]) ?? []),
    ].filter(Boolean);

    let pessoaEmbedded = 0;

    for (const url of urls) {
      let buffer: Buffer;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error("HTTP " + res.status);
        buffer = Buffer.from(await res.arrayBuffer());
      } catch {
        continue;
      }

      let embedResponse;
      try {
        embedResponse = await embedImage(buffer);
      } catch {
        continue;
      }

      for (let faceIndex = 0; faceIndex < embedResponse.faces.length; faceIndex++) {
        const face = embedResponse.faces[faceIndex];
        await service.from("face_embeddings").insert({
          source: "qualificados",
          source_id: pessoa.id,
          source_label: pessoa.nome,
          photo_url: url,
          embedding: JSON.stringify(face.embedding),
          bbox: face.bbox,
          det_score: face.det_score,
          face_index: faceIndex,
        });
        pessoaEmbedded++;
      }
    }

    if (pessoaEmbedded === 0) {
      await service.from("face_skipped").upsert({
        source: "qualificados",
        source_id: pessoa.id,
        source_label: pessoa.nome,
        reason: "no_face_detected",
      }, { onConflict: "source,source_id" });
      skipped++;
    } else {
      embedded += pessoaEmbedded;
    }

    processed++;
  }

  return NextResponse.json({ ok: true, processed, embedded, skipped });
}
