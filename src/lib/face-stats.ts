import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export interface SkippedRecord {
  source_id: string;
  source_label: string | null;
}

export interface FaceStats {
  totalQualificados: number;
  totalIndexados: number;
  totalSkipped: number;
  totalSemFoto: number;
  cobertura: number;
  skippedList: SkippedRecord[];
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

  const { data, error } = await supabase.rpc("get_face_stats");
  if (error || !data) throw new Error(`get_face_stats: ${error?.message ?? "no data"}`);

  const totalQualificados = Number(data.total_qualificados);
  const totalIndexados    = Number(data.total_indexados);
  const totalSkipped      = Number(data.total_skipped);
  const totalSemFoto      = Number(data.total_sem_foto);
  const totalComFoto      = Number(data.total_com_foto);
  const skippedList       = (data.skipped_list ?? []) as SkippedRecord[];

  const cobertura = totalComFoto > 0
    ? Math.round((totalIndexados / totalComFoto) * 100)
    : 0;

  return { totalQualificados, totalIndexados, totalSkipped, totalSemFoto, cobertura, skippedList };
}
