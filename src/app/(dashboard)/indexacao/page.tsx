import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import SemFotoList from "@/components/SemFotoList";
import SemRostoList from "@/components/SemRostoList";
import IndexacaoStats from "@/components/IndexacaoStats";
import { getFaceStats } from "@/lib/face-stats";
import { getUserRole } from "@/lib/get-role";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function IndexacaoPage() {
  const supabase = getAdminClient();
  const role = await getUserRole();
  const viewer = role === "viewer";

  const [stats, { count: driveIndexed }, { count: driveSkipped }, { data: semFotoData }] =
    await Promise.all([
      getFaceStats(),
      supabase.from("face_embeddings").select("*", { count: "exact", head: true }).eq("source", "drive_bq"),
      supabase.from("face_skipped").select("*", { count: "exact", head: true }).eq("source", "drive_bq"),
      supabase
        .from("qualificados")
        .select("id, nome")
        .is("deleted_at", null)
        .is("foto_url", null)
        .order("nome", { ascending: true })
        .limit(10000),
    ]);

  const { totalQualificados, totalIndexados, totalSkipped, totalSemFoto, skippedList } = stats;
  const semFotoList = (semFotoData ?? []).map((r: { id: string; nome: string }) => ({ id: r.id, nome: r.nome }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Indexação</h1>

      <IndexacaoStats
        totalQualificados={totalQualificados}
        totalIndexados={totalIndexados}
        totalSkipped={totalSkipped}
        totalSemFoto={totalSemFoto}
        driveIndexed={driveIndexed ?? 0}
        driveSkipped={driveSkipped ?? 0}
        isViewer={viewer}
      />

      {!viewer && <SemFotoList qualificados={semFotoList} />}
      {!viewer && <SemRostoList records={skippedList} total={totalSkipped} />}
    </div>
  );
}
