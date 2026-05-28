import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BackfillStatus from "@/components/BackfillStatus";
import SemFotoList from "@/components/SemFotoList";
import SemRostoList from "@/components/SemRostoList";
import { CheckCircle, Clock, XCircle, TrendingUp, Info } from "lucide-react";
import { getFaceStats } from "@/lib/face-stats";
import { countBQDriveFiles, hasBQDriveConfig } from "@/lib/google-drive";
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

async function getDriveStats() {
  const supabase = getAdminClient();

  let driveFiles = 0;
  if (hasBQDriveConfig() && process.env.DRIVE_BQ_FOLDER_ID) {
    try {
      driveFiles = await countBQDriveFiles(process.env.DRIVE_BQ_FOLDER_ID);
    } catch { driveFiles = 0; }
  }

  const [{ count: driveIndexed }, { count: driveSkipped }] = await Promise.all([
    supabase.from("face_embeddings").select("*", { count: "exact", head: true }).eq("source", "drive_bq"),
    supabase.from("face_skipped").select("*", { count: "exact", head: true }).eq("source", "drive_bq"),
  ]);

  return {
    driveFiles,
    driveIndexed: driveIndexed ?? 0,
    driveSkipped: driveSkipped ?? 0,
  };
}

export default async function IndexacaoPage() {
  const supabase = getAdminClient();
  const role = await getUserRole();
  const viewer = role === "viewer";

  const [stats, driveStats, { data: semFotoData }] = await Promise.all([
    getFaceStats(),
    getDriveStats(),
    supabase
      .from("qualificados")
      .select("id, nome")
      .is("deleted_at", null)
      .is("foto_url", null)
      .order("nome", { ascending: true })
      .limit(10000),
  ]);

  const { totalQualificados, totalIndexados, totalSkipped, totalSemFoto, skippedList } = stats;
  const { driveFiles, driveIndexed, driveSkipped } = driveStats;

  const ibisComFoto = totalQualificados - totalSemFoto;
  const totalComFoto = ibisComFoto + driveFiles;
  const totalIndexadosGeral = totalIndexados + driveIndexed;
  const totalSkippedGeral = totalSkipped + driveSkipped;
  const cobertura = totalComFoto > 0 ? Math.round((totalIndexadosGeral / totalComFoto) * 100) : 0;

  const ibisPendentes = Math.max(0, ibisComFoto - totalIndexados - totalSkipped);
  const drivePendentes = Math.max(0, driveFiles - driveIndexed - driveSkipped);
  const pendentes = ibisPendentes + drivePendentes;

  const semFotoList = (semFotoData ?? []).map((r: { id: string; nome: string }) => ({ id: r.id, nome: r.nome }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Indexação</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} color="blue" label="Cobertura" value={`${cobertura}%`} />
        <StatCard icon={CheckCircle} color="green" label="Indexados" value={totalIndexadosGeral} />
        <StatCard icon={Clock} color="yellow" label="Pendentes" value={pendentes} />
        <StatCard icon={XCircle} color="red" label="Sem rosto" value={totalSkippedGeral} />
      </div>

      {!viewer && <SemFotoList qualificados={semFotoList} />}
      {!viewer && <SemRostoList records={skippedList} total={totalSkipped} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Indexação de embeddings</h2>
          <BackfillStatus initialRemaining={pendentes} isViewer={viewer} />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <h2 className="font-semibold text-white">Cadastro de qualificados</h2>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            O cadastro de novos qualificados no sistema é feito exclusivamente por pessoal autorizado.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Para inclusão, atualização ou remoção de registros, entre em contato com:
          </p>
          <div className="bg-gray-800 rounded-lg p-4 mt-1 space-y-2">
            <p className="text-white text-sm font-medium">Administrador do Sistema</p>
            <p className="text-gray-400 text-xs">ou</p>
            <p className="text-white text-sm font-medium">Agência Local de Inteligência</p>
            <p className="text-blue-400 text-sm font-semibold">42º Batalhão de Polícia Militar</p>
          </div>
        </div>
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
