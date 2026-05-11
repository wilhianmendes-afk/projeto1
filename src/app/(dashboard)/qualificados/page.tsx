import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import QualificadosSearch from "@/components/QualificadosSearch";
import TotalQualificados from "@/components/TotalQualificados";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function QualificadosPage() {
  const supabase = getAdminClient();

  const { data: qualificados, count } = await supabase
    .from("qualificados")
    .select("id, nome, vulgo, cpf, rg, nascimento, genitora, foto_url, fonte, observacoes, created_at", { count: "exact" })
    .is("deleted_at", null)
    .order("nome")
    .limit(100000);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Qualificados</h1>
          <TotalQualificados local={count ?? 0} />
        </div>
        <Link
          href="/qualificados/novo"
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Novo
        </Link>
      </div>

      <QualificadosSearch initialData={qualificados ?? []} totalCount={count ?? 0} />
    </div>
  );
}
