import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Search, Users, Database, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function DashboardPage() {
  const supabase = getAdminClient();

  const [
    { count: totalQualificados },
    { count: totalEmbeddings },
    { count: totalSkipped },
  ] = await Promise.all([
    supabase.from("qualificados").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("face_embeddings").select("*", { count: "exact", head: true }).eq("source", "qualificados"),
    supabase.from("face_skipped").select("*", { count: "exact", head: true }).eq("source", "qualificados"),
  ]);

  const cobertura =
    totalQualificados && totalQualificados > 0
      ? Math.round(((totalEmbeddings ?? 0) / totalQualificados) * 100)
      : 0;

  const stats = [
    {
      label: "Qualificados",
      value: totalQualificados ?? 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-950",
    },
    {
      label: "Embeddings",
      value: totalEmbeddings ?? 0,
      icon: Database,
      color: "text-green-400",
      bg: "bg-green-950",
    },
    {
      label: "Sem rosto",
      value: totalSkipped ?? 0,
      icon: AlertTriangle,
      color: "text-yellow-400",
      bg: "bg-yellow-950",
    },
    {
      label: "Cobertura",
      value: `${cobertura}%`,
      icon: Search,
      color: cobertura >= 95 ? "text-green-400" : "text-orange-400",
      bg: cobertura >= 95 ? "bg-green-950" : "bg-orange-950",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className={`${s.bg} ${s.color} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-gray-400 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/busca"
          className="bg-blue-900 hover:bg-blue-800 border border-blue-700 rounded-xl p-6 flex items-center gap-4 transition-colors"
        >
          <Search className="w-8 h-8 text-blue-300" />
          <div>
            <p className="font-semibold text-white text-lg">Busca Facial</p>
            <p className="text-blue-300 text-sm">Enviar foto e buscar no banco</p>
          </div>
        </Link>

        <Link
          href="/indexacao"
          className="bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-xl p-6 flex items-center gap-4 transition-colors"
        >
          <Database className="w-8 h-8 text-gray-300" />
          <div>
            <p className="font-semibold text-white text-lg">Indexação</p>
            <p className="text-gray-400 text-sm">Status e importação de fotos</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
