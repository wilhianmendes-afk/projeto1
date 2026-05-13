import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getDriveClient } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function extractDriveId(input: string): string {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return input.trim();
}

// GET — lista pastas configuradas
export async function GET() {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("drive_sync_folders")
    .select("*")
    .order("created_at", { ascending: true });
  return NextResponse.json({ folders: data ?? [] });
}

// POST — adiciona pasta
export async function POST(req: NextRequest) {
  const sbAuth = await createClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { input } = await req.json();
  const folderId = extractDriveId(input ?? "");
  if (!folderId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = getAdminClient();

  // Tenta obter o nome da pasta no Drive
  let folderName: string | null = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const drive = getDriveClient();
      const meta = await drive.files.get({ fileId: folderId, fields: "name, mimeType" });
      folderName = meta.data.name ?? null;
    } catch { /* sem credenciais ou pasta inacessível */ }
  }

  const { data, error } = await supabase
    .from("drive_sync_folders")
    .insert({ folder_id: folderId, folder_name: folderName, active: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ folder: data });
}

// DELETE — remove pasta
export async function DELETE(req: NextRequest) {
  const sbAuth = await createClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await req.json();
  const supabase = getAdminClient();
  await supabase.from("drive_sync_folders").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
