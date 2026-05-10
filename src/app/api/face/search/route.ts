import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";

const BRUNO_URL = process.env.BANCO_BRUNO_URL;
const BRUNO_TOKEN = process.env.BANCO_BRUNO_TOKEN;

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
      image_size: embedResponse.image_size,
      elapsed_ms: embedResponse.elapsed_ms,
    });
  }

  const bestFace = embedResponse.faces.reduce((a, b) =>
    a.det_score > b.det_score ? a : b
  );

  const service = getAdminClient();

  // Busca local + Bruno em paralelo
  const base64Image = buffer.toString("base64");

  const [localSearch, brunoSearch] = await Promise.allSettled([
    service.rpc("face_search", {
      query_embedding: JSON.stringify(bestFace.embedding),
      similarity_threshold: threshold,
      match_count: limit,
    }),
    BRUNO_URL && BRUNO_TOKEN
      ? fetch(BRUNO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRUNO_TOKEN}` },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "tools/call",
            params: { name: "search_face", arguments: { image_base64: base64Image, threshold, limit } },
          }),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json())
      : Promise.resolve(null),
  ]);

  // Processa resultado local
  if (localSearch.status === "rejected" || localSearch.value?.error) {
    return NextResponse.json({ error: "Erro na busca local" }, { status: 500 });
  }
  const matches = localSearch.value?.data ?? [];

  const sourceIds = [...new Set(matches.map((m: { source_id: string }) => m.source_id))];
  let pessoas: Record<string, { nome: string; vulgo?: string; cpf?: string; cidade?: string; uf?: string; nascimento?: string; genitora?: string }> = {};
  if (sourceIds.length > 0) {
    const { data } = await service
      .from("qualificados")
      .select("id, nome, vulgo, cpf, cidade, uf, nascimento, genitora")
      .in("id", sourceIds);
    pessoas = Object.fromEntries((data ?? []).map((p) => [p.id, p]));
  }

  const localResults = matches.map((m: { source_id: string; photo_url: string; similarity: number; det_score: number; bbox: object }) => ({
    ...m,
    from_bruno: false,
    pessoa: pessoas[m.source_id] ?? null,
    confidence: m.similarity >= 0.55 ? "alta" : m.similarity >= 0.42 ? "forte" : m.similarity >= 0.30 ? "incerto" : "baixa",
  }));

  // Processa resultado do Bruno
  let brunoResults: unknown[] = [];
  if (brunoSearch.status === "fulfilled" && brunoSearch.value) {
    try {
      const text = brunoSearch.value?.result?.content?.[0]?.text;
      if (text) {
        type BrunoFaceMatch = { source: string; source_id: string; photo_url: string; similarity: number; det_score: number; bbox: object; confidence: string };
        const parsed = JSON.parse(text) as { results?: BrunoFaceMatch[] };
        const rawMatches = parsed.results ?? [];

        // Busca dados da pessoa para cada match do banco_qualificados em paralelo
        const enriched = await Promise.all(
          rawMatches.map(async (m) => {
            let pessoa: { nome: string; vulgo?: string; cpf?: string; cidade?: string; nascimento?: string; genitora?: string } | null = null;
            if (m.source === "banco_qualificados" && BRUNO_URL && BRUNO_TOKEN) {
              try {
                const r = await fetch(BRUNO_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRUNO_TOKEN}` },
                  body: JSON.stringify({
                    jsonrpc: "2.0", id: 1, method: "tools/call",
                    params: { name: "get_qualificado", arguments: { id: m.source_id } },
                  }),
                  signal: AbortSignal.timeout(8000),
                });
                const d = await r.json();
                const t = d?.result?.content?.[0]?.text;
                if (t) {
                  const q = JSON.parse(t);
                  pessoa = { nome: q.nome, vulgo: q.vulgo, cpf: q.cpf, cidade: q.cidade, nascimento: q.dn, genitora: q.genitora };
                }
              } catch { /* silently ignore */ }
            }
            return { ...m, from_bruno: true, bruno_id: m.source_id, pessoa };
          })
        );
        brunoResults = enriched;
      }
    } catch { /* silently ignore */ }
  }

  // Mescla e ordena por similaridade
  const allResults = [...localResults, ...brunoResults].sort(
    (a, b) => (b as { similarity: number }).similarity - (a as { similarity: number }).similarity
  );

  return NextResponse.json({
    results: allResults,
    query_det_score: bestFace.det_score,
    query_bbox: bestFace.bbox,
    faces_detected: embedResponse.total_detected,
    image_size: embedResponse.image_size,
    elapsed_ms: embedResponse.elapsed_ms,
  });
}
