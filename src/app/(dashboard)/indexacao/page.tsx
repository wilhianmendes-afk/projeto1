import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BackfillButton from "@/components/BackfillButton";
import DriveImport from "@/components/DriveImport";
import { CheckCircle, Clock, XCircle, TrendingUp } from "lucide-react";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function IndexacaoPage() {
  const supabase = getAdminClient();

  const [
    { count: totalAtivos },
    { count: totalIndexados },
    { count: totalSkipped },
    { data: recentSkipped },
  ] = await Promise.all([
    supabase
      .from("qualificados")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("face_embeddings")
      .select("source_id", { count: "exact", head: true })
      .eq("source", "qualificados"),
    supabase
      .from("face_skipped")
      .select("*", { count: "exact", head: true })
      .eq("source", "qualificados"),
    supabase
      .from("face_skipped")
      .select("source_label, reason, created_at")
      .eq("source", "qualificados")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const pendentes = (totalAtivos ?? 0) - (totalIndexados ?? 0) - (totalSkipped ?? 0);
  const cobertura =
    totalAtivos && totalAtivos > 0
      ? Math.round(((totalIndexados ?? 0) / totalAtivos) * 100)
      : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Indexação</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} color="blue" label="Cobertura" value={`${cobertura}%`} />
        <StatCard icon={CheckCircle} color="green" label="Indexados" value={totalIndexados ?? 0} />
        <StatCard icon={Clock} color="yellow" label="Pendentes" value={Math.max(0, pendentes)} />
        <StatCard icon={XCircle} color="red" label="Sem rosto" value={totalSkipped ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-3">Backfill manual</h2>
          <p className="text-gray-400 text-sm mb-4">
            Processa todos os qualificados sem embedding. Pode levar vários minutos dependendo do volume.
          </p>
          <BackfillButton />
        </div>

        <DriveImport />
      </div>

      {recentSkipped && recentSkipped.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-3">Últimos ignorados</h2>
          <div className="space-y-2">
            {recentSkipped.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                <span className="text-gray-300 truncate max-w-xs">{s.source_label ?? "—"}</span>
                <span className="text-yellow-400 text-xs ml-2">{s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
