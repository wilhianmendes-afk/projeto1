import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BackfillStatus from "@/components/BackfillStatus";
import DriveImport from "@/components/DriveImport";
import SemFotoList from "@/components/SemFotoList";
import SemRostoList from "@/components/SemRostoList";
import { CheckCircle, Clock, XCircle, TrendingUp } from "lucide-react";
import { getFaceStats } from "@/lib/face-stats";

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

  // Todos os dados via RPC — bypassa max_rows e evita divergências
  const [stats, { data: semFotoData }] = await Promise.all([
    getFaceStats(),
    supabase
      .from("qualificados")
      .select("id, nome")
      .is("deleted_at", null)
      .is("foto_url", null)
      .order("nome", { ascending: true })
      .limit(10000),
  ]);

  const { totalQualificados, totalIndexados, totalSkipped, totalSemFoto, cobertura, skippedList } = stats;
  const semFotoList = (semFotoData ?? []).map((r: { id: string; nome: string }) => ({ id: r.id, nome: r.nome }));
  const semRostoList = skippedList; // vem do RPC — mesma fonte do stat card
  const pendentes = Math.max(0, totalQualificados - totalSemFoto - totalIndexados - totalSkipped);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Indexação</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} color="blue" label="Cobertura" value={`${cobertura}%`} />
        <StatCard icon={CheckCircle} color="green" label="Indexados" value={totalIndexados} />
        <StatCard icon={Clock} color="yellow" label="Pendentes" value={pendentes} />
        <StatCard icon={XCircle} color="red" label="Sem rosto" value={totalSkipped} />
      </div>

      <SemFotoList qualificados={semFotoList} />
      <SemRostoList records={semRostoList} total={totalSkipped} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Indexação de embeddings</h2>
          <BackfillStatus initialRemaining={pendentes} />
        </div>

        <DriveImport />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  value: string | number;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-950 text-blue-400",
    green: "bg-green-950 text-green-400",
    yellow: "bg-yellow-950 text-yellow-400",
    red: "bg-red-950 text-red-400",
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className={`${colors[color]} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-gray-400 text-sm">{label}</p>
    </div>
  );
}
