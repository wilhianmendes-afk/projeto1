import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const db = getAdminClient();

  const formData = await req.formData();
  const file = formData.get("foto") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhuma foto enviada" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `manual/${id}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload para o bucket faces
  const { error: upErr } = await db.storage
    .from("faces")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = db.storage.from("faces").getPublicUrl(path);

  // Atualiza foto_url do qualificado
  const { error: updErr } = await db
    .from("qualificados")
    .update({ foto_url: publicUrl })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Remove embedding e skipped anteriores para forçar re-indexação
  await db.from("face_embeddings").delete().eq("source", "qualificados").eq("source_id", id);
  await db.from("face_skipped").delete().eq("source", "qualificados").eq("source_id", id);

  return NextResponse.json({ ok: true, foto_url: publicUrl });
}
