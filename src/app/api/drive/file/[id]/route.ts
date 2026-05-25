import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getBQDriveClient, hasBQDriveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  if (!hasBQDriveConfig()) {
    return NextResponse.json({ error: "Drive BQ não configurado" }, { status: 400 });
  }

  try {
    // Apaga do Google Drive (permanente)
    const drive = getBQDriveClient();
    await drive.files.delete({ fileId: id });
  } catch (err) {
    console.error("[drive/file/delete] erro ao apagar do Drive:", err);
    return NextResponse.json({ error: "Erro ao apagar do Drive" }, { status: 500 });
  }

  // Remove embeddings e face_skipped do banco
  const db = getAdminClient();
  await Promise.all([
    db.from("face_embeddings").delete().eq("source", "drive_bq").eq("source_id", id),
    db.from("face_skipped").delete().eq("source", "drive_bq").eq("source_id", id),
  ]);

  return NextResponse.json({ ok: true });
}
