import { BookUser } from "lucide-react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BancoParceiros from "@/components/BancoParceiros";
import DriveCards from "@/components/DriveCards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getIbisCount() {
  const supabase = getAdminClient();
  const { count } = await supabase
    .from("qualificados")
    .select("*", { count: "exact", head: true })
    .eq("fonte", "ibis")
    .is("deleted_at", null);
  return count ?? 0;
}

export default async function DashboardPage() {
  const ibisCount = await getIbisCount();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="bg-blue-950 text-blue-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
            <BookUser className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{ibisCount.toLocaleString("pt-BR")}</p>
          <p className="text-gray-400 text-sm">IBIS</p>
        </div>

        <DriveCards ibisCount={ibisCount} />
      </div>

      <BancoParceiros />
    </div>
  );
}
