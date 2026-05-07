import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { qualificadoId } = await req.json();
  if (!qualificadoId) return NextResponse.json({ error: "qualificadoId obrigatório" }, { status: 400 });

  const service = getAdminClient();

  const { data: pessoa } = await service
    .from("qualificados")
    .select("id, nome, foto_url, fotos_extras")
    .eq("id", qualificadoId)
    .single();

  if (!pessoa) return NextResponse.json({ error: "Qualificado não encontrado" }, { status: 404 });

  const allUrls: string[] = [
    pessoa.foto_url,
    ...((pessoa.fotos_extras as string[]) ?? []),
  ].filter(Boolean);

  let embedded = 0;

  for (const url of allUrls) {
    let buffer: Buffer;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      buffer = Buffer.from(await res.arrayBuffer());
    } catch {
      await service.from("face_skipped").upsert({
        source: "qualificados",
        source_id: qualificadoId,
        source_label: pessoa.nome,
        reason: "photo_404",
      }, { onConflict: "source,source_id" });
      continue;
    }

    let embedResponse;
    try {
      embedResponse = await embedImage(buffer);
      // Se não detectou com threshold padrão, tenta com threshold menor
      if (embedResponse.count === 0 && embedResponse.total_detected === 0) {
        embedResponse = await embedImage(buffer, "photo.jpg", 0.35);
      }
    } catch {
      continue;
    }

    if (embedResponse.count === 0) {
      if (allUrls.indexOf(url) === allUrls.length - 1 && embedded === 0) {
        await service.from("face_skipped").upsert({
          source: "qualificados",
          source_id: qualificadoId,
          source_label: pessoa.nome,
          reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
      }
      continue;
    }

    for (let faceIndex = 0; faceIndex < embedResponse.faces.length; faceIndex++) {
      const face = embedResponse.faces[faceIndex];
      await service.from("face_embeddings").insert({
        source: "qualificados",
        source_id: qualificadoId,
        source_label: pessoa.nome,
        photo_url: url,
        embedding: JSON.stringify(face.embedding),
        bbox: face.bbox,
        det_score: face.det_score,
        face_index: faceIndex,
      });
      embedded++;
    }

    await service
      .from("face_skipped")
      .delete()
      .eq("source", "qualificados")
      .eq("source_id", qualificadoId);
  }

  return NextResponse.json({ ok: true, embedded });
}
