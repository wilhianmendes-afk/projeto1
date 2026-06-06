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

function gerarSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { nome, tipo, og_titulo, og_descricao, og_imagem_url, slug: slugInput, redirect_url, pix, anuncio } = body;

  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const slug = slugInput?.trim() || gerarSlug();
  if (!/^[a-z0-9\-_]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug inválido — use apenas letras minúsculas, números, hífens e underscores." }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: existing } = await supabase
    .from("ops_hispy_investigations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Esse slug já está em uso. Escolha outro." }, { status: 409 });

  const { data, error } = await supabase
    .from("ops_hispy_investigations")
    .insert({
      nome: nome.trim(),
      slug,
      tipo: tipo || "reportagem",
      og_titulo: og_titulo || null,
      og_descricao: og_descricao || null,
      og_imagem_url: og_imagem_url || null,
      redirect_url: redirect_url || null,
      created_by: user.id,
      // Campos PIX
      pix_banco:      pix?.banco      || null,
      pix_valor:      pix?.valor      || null,
      pix_data:       pix?.data       || null,
      pix_horario:    pix?.horario    || null,
      pix_de_nome:    pix?.de_nome    || null,
      pix_de_cpf:     pix?.de_cpf     || null,
      pix_de_banco:   pix?.de_banco   || null,
      pix_para_nome:  pix?.para_nome  || null,
      pix_para_cpf:   pix?.para_cpf   || null,
      pix_para_banco: pix?.para_banco || null,
      pix_transacao:       pix?.transacao        || null,
      pix_id:              pix?.id               || null,
      // Anúncio
      anuncio_plataforma:  anuncio?.plataforma   || null,
      anuncio_preco:       anuncio?.preco         || null,
      anuncio_imagem_url:  anuncio?.imagem_url   || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
