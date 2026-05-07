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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const threshold = parseFloat((formData.get("threshold") as string) ?? "0.30");
  const limit = parseInt((formData.get("limit") as string) ?? "15");

  if (!file) return NextResponse.json({ error: "Nenhuma imagem enviada" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let embedResponse;
  try {
    embedResponse = await embedImage(buffer, file.name);
    // Retry com threshold menor se detectou mas abaixo do score
    if (embedResponse.count === 0 && embedResponse.total_detected > 0) {
      embedResponse = await embedImage(buffer, file.name, 0.35);
    }
  } catch (err) {
    return NextResponse.json({ error: "Erro no face-service: " + String(err) }, { status: 502 });
  }

  if (embedResponse.count === 0) {
    return NextResponse.json({
      results: [],
      message:
        embedResponse.total_detected === 0
          ? `Nenhum rosto detectado na imagem. (tamanho: ${embedResponse.image_size?.w}×${embedResponse.image_size?.h}px)`
          : "Rosto detectado mas com qualidade baixa (det_score < 0.35).",
      elapsed_ms: embedResponse.elapsed_ms,
    });
  }

  const bestFace = embedResponse.faces.reduce((a, b) =>
    a.det_score > b.det_score ? a : b
  );

  const service = getAdminClient();
  const { data: matches, error } = await service.rpc("face_search", {
    query_embedding: JSON.stringify(bestFace.embedding),
    similarity_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    return NextResponse.json({ error: "Erro na busca: " + error.message }, { status: 500 });
  }

  const sourceIds = [...new Set((matches ?? []).map((m: { source_id: string }) => m.source_id))];

  let pessoas: Record<string, { nome: string; vulgo?: string; cpf?: string; cidade?: string; uf?: string }> = {};
  if (sourceIds.length > 0) {
    const { data } = await service
      .from("qualificados")
      .select("id, nome, vulgo, cpf, cidade, uf")
      .in("id", sourceIds);
    pessoas = Object.fromEntries((data ?? []).map((p) => [p.id, p]));
  }

  const results = (matches ?? []).map((m: {
    source_id: string;
    photo_url: string;
    similarity: number;
    det_score: number;
    bbox: object;
  }) => ({
    ...m,
    pessoa: pessoas[m.source_id] ?? null,
    confidence:
      m.similarity >= 0.55 ? "alta" :
      m.similarity >= 0.42 ? "forte" :
      m.similarity >= 0.30 ? "incerto" : "baixa",
  }));

  return NextResponse.json({
    results,
    query_det_score: bestFace.det_score,
    query_bbox: bestFace.bbox,
    faces_detected: embedResponse.total_detected,
    elapsed_ms: embedResponse.elapsed_ms,
  });
}
