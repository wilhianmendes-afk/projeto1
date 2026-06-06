import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();

  const [{ data: investigation }, { data: captures }] = await Promise.all([
    supabase.from("ops_hispy_investigations").select("*").eq("id", params.id).single(),
    supabase
      .from("ops_hispy_captures")
      .select("*")
      .eq("investigation_id", params.id)
      .order("captured_at", { ascending: false }),
  ]);

  if (!investigation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...investigation, captures: captures ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("ops_hispy_investigations")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();

  // Busca capturas para remover fotos do Storage
  const { data: captures } = await supabase
    .from("ops_hispy_captures")
    .select("id, foto_frente_url, foto_traseira_url")
    .eq("investigation_id", params.id);

  if (captures?.length) {
    const paths: string[] = [];
    for (const c of captures) {
      if (c.foto_frente_url) paths.push(`intel-link/${c.id}/front.jpg`);
      if (c.foto_traseira_url) paths.push(`intel-link/${c.id}/back.jpg`);
    }
    if (paths.length) await supabase.storage.from("faces").remove(paths);
  }

  const { error } = await supabase
    .from("ops_hispy_investigations")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
