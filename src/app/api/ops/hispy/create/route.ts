import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nome, tipo, og_titulo, og_descricao, og_imagem_url } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const slug = randomBytes(8).toString("hex").slice(0, 12);
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("ops_hispy_investigations")
    .insert({
      nome: nome.trim(),
      slug,
      tipo: tipo || "reportagem",
      og_titulo: og_titulo || null,
      og_descricao: og_descricao || null,
      og_imagem_url: og_imagem_url || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
