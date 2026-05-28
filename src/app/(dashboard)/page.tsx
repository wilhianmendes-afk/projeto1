import { FolderOpen, BookUser, LayoutList } from "lucide-react";
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
      const queue = [process.env.DRIVE_BQ_FOLDER_ID];
      while (queue.length > 0) {
        const currentFolder = queue.shift()!;
        let pageToken: string | undefined;
        do {
          const { data } = await drive.files.list({
            q: `'${currentFolder}' in parents and trashed = false`,
            fields: "nextPageToken, files(id, mimeType)",
            pageSize: 1000,
            pageToken,
          });
          for (const f of data.files ?? []) {
            if (f.mimeType === "application/vnd.google-apps.folder") {
              queue.push(f.id!);
            } else {
              driveCount++;
            }
          }
          pageToken = data.nextPageToken ?? undefined;
        } while (pageToken);
      }
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
    </div>
  );
}
