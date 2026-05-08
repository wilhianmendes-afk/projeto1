import Link from "next/link";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BackfillButton from "@/components/BackfillButton";
import ClearSkippedButton from "@/components/ClearSkippedButton";
import DriveImport from "@/components/DriveImport";
import { CheckCircle, Clock, XCircle, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

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
    { data: activeQualificados },
    { data: embeddingIds },
    { data: skippedIds },
    { data: recentSkipped },
  ] = await Promise.all([
    supabase
      .from("qualificados")
      .select("id")
      .is("deleted_at", null),
    supabase
      .from("face_embeddings")
      .select("source_id")
      .eq("source", "qualificados"),
    supabase
      .from("face_skipped")
      .select("source_id, source_label, reason")
      .eq("source", "qualificados"),
    supabase
      .from("face_skipped")
      .select("source_id, source_label, reason, created_at")
      .eq("source", "qualificados")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const activeIdSet = new Set((activeQualificados ?? []).map((r: { id: string }) => r.id));
  const totalAtivos = activeIdSet.size;

  // Só conta indexados/skipped cujo source_id ainda existe em qualificados ativos
  const totalIndexados = new Set(
    (embeddingIds ?? [])
      .map((r: { source_id: string }) => r.source_id)
      .filter((id: string) => activeIdSet.has(id))
  ).size;

  const totalSkipped = (skippedIds ?? []).filter(
    (r: { source_id: string }) => activeIdSet.has(r.source_id)
  ).length;

  const pendentes = Math.max(0, totalAtivos - totalIndexados - totalSkipped);
  const cobertura = totalAtivos > 0 ? Math.round((totalIndexados / totalAtivos) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Indexação</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} color="blue" label="Cobertura" value={`${cobertura}%`} />
        <StatCard icon={CheckCircle} color="green" label="Indexados" value={totalIndexados ?? 0} />
        <StatCard icon={Clock} color="yellow" label="Pendentes" value={Math.max(0, pendentes)} />
        <StatCard icon={XCircle} color="red" label="Sem rosto" value={totalSkipped} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Indexação de embeddings</h2>
          <BackfillButton />
        </div>

        <DriveImport />
      </div>

      {recentSkipped && recentSkipped.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">Sem rosto detectado</h2>
            <ClearSkippedButton total={totalSkipped} />
          </div>
          <div className="space-y-2">
            {recentSkipped.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                <Link
                  href={`/qualificados/${s.source_id}`}
                  className="text-gray-300 hover:text-white hover:underline truncate max-w-xs transition-colors"
                >
                  {s.source_label ?? "—"}
                </Link>
                <span className="text-yellow-400 text-xs ml-2 flex-shrink-0">{s.reason}</span>
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
