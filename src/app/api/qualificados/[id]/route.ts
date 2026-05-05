import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function storagePathFromUrl(url: string): string | null {
  // https://xxx.supabase.co/storage/v1/object/public/faces/ibis/file.jpg → ibis/file.jpg
  const match = url.match(/\/storage\/v1\/object\/public\/faces\/(.+)$/);
  return match ? match[1] : null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verifica sessão
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const service = getAdminClient();

  // Busca dados antes de deletar (para remover foto do Storage)
  const { data: pessoa } = await service
    .from("qualificados").select("foto_url, fotos_extras").eq("id", id).maybeSingle();

  if (!pessoa) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Remove embeddings e skipped
  await service.from("face_embeddings").delete().eq("source", "qualificados").eq("source_id", id);
  await service.from("face_skipped").delete().eq("source", "qualificados").eq("source_id", id);

  // Remove fotos do Storage
  const pathsParaDeletar: string[] = [];
  if (pessoa.foto_url) {
    const p = storagePathFromUrl(pessoa.foto_url);
    if (p) pathsParaDeletar.push(p);
  }
  if (Array.isArray(pessoa.fotos_extras)) {
    for (const url of pessoa.fotos_extras) {
      const p = storagePathFromUrl(url);
      if (p) pathsParaDeletar.push(p);
    }
  }
  if (pathsParaDeletar.length > 0) {
    await service.storage.from("faces").remove(pathsParaDeletar);
  }

  // Deleta o registro
  const { error } = await service.from("qualificados").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
