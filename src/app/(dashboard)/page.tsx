import { Search, Database, FolderOpen, BookUser, LayoutList } from "lucide-react";
import Link from "next/link";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getBQDriveClient, hasBQDriveConfig } from "@/lib/google-drive";
import BancoParceiros from "@/components/BancoParceiros";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getFontesCounts() {
  const supabase = getAdminClient();

  const { count: ibisCount } = await supabase
    .from("qualificados")
    .select("*", { count: "exact", head: true })
    .eq("fonte", "ibis")
    .is("deleted_at", null);

  let driveCount = 0;
  if (hasBQDriveConfig() && process.env.DRIVE_BQ_FOLDER_ID) {
    try {
      const drive = getBQDriveClient();
      let total = 0;
      let pageToken: string | undefined;
      do {
        const { data } = await drive.files.list({
          q: `'${process.env.DRIVE_BQ_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: "nextPageToken, files(id)",
          pageSize: 1000,
          pageToken,
        });
        total += data.files?.length ?? 0;
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);
      driveCount = total;
    } catch {
      driveCount = 0;
    }
  }

  return {
    ibis: ibisCount ?? 0,
    drive: driveCount,
    total: (ibisCount ?? 0) + driveCount,
  };
}

export default async function DashboardPage() {
  const fontes = await getFontesCounts();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="bg-blue-950 text-blue-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
            <BookUser className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{fontes.ibis.toLocaleString("pt-BR")}</p>
          <p className="text-gray-400 text-sm">IBIS</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="bg-green-950 text-green-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
            <FolderOpen className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{fontes.drive.toLocaleString("pt-BR")}</p>
          <p className="text-gray-400 text-sm">Meu Drive</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="bg-purple-950 text-purple-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
            <LayoutList className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{fontes.total.toLocaleString("pt-BR")}</p>
          <p className="text-gray-400 text-sm">Total geral</p>
        </div>
      </div>

      <BancoParceiros />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
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
            <p className="text-gray-400 text-sm">Status dos embeddings faciais</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
