import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export interface FaceStats {
  totalQualificados: number;
  totalIndexados: number;
  totalSkipped: number;
  totalSemFoto: number;
  cobertura: number; // % sobre qualificados com foto
}

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getFaceStats(): Promise<FaceStats> {
  const supabase = getAdminClient();

  const [
    { data: qualificados },
    { data: embeddingIds },
    { data: skippedIds },
  ] = await Promise.all([
    supabase
      .from("qualificados")
      .select("id, foto_url")
      .is("deleted_at", null)
      .limit(10000),
    supabase
      .from("face_embeddings")
      .select("source_id")
      .eq("source", "qualificados")
      .limit(50000),
    supabase
      .from("face_skipped")
      .select("source_id")
      .eq("source", "qualificados")
      .limit(10000),
  ]);

  const activeIdSet = new Set((qualificados ?? []).map((r: { id: string }) => r.id));
  const totalQualificados = activeIdSet.size;

  const semFotoIds = new Set(
    (qualificados ?? [])
      .filter((r: { foto_url: string | null }) => !r.foto_url)
      .map((r: { id: string }) => r.id)
  );
  const totalSemFoto = semFotoIds.size;
  const totalComFoto = totalQualificados - totalSemFoto;

  const totalIndexados = new Set(
    (embeddingIds ?? [])
      .map((r: { source_id: string }) => r.source_id)
      .filter((id: string) => activeIdSet.has(id))
  ).size;

  const totalSkipped = (skippedIds ?? []).filter(
    (r: { source_id: string }) => activeIdSet.has(r.source_id)
  ).length;

  const cobertura = totalComFoto > 0
    ? Math.round((totalIndexados / totalComFoto) * 100)
    : 0;

  return { totalQualificados, totalIndexados, totalSkipped, totalSemFoto, cobertura };
}
