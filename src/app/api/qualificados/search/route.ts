import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const supabase = getAdminClient();

  // Busca nos campos de texto + observacoes (que contém todo o texto OCR da foto)
  // Dentro de .or() o PostgREST usa * como wildcard (não %)
  const { data, error } = await supabase
    .from("qualificados")
    .select("id, nome, vulgo, cpf, nascimento, genitora, foto_url, observacoes, fonte")
    .is("deleted_at", null)
    .or(
      `nome.ilike.*${q}*,` +
      `vulgo.ilike.*${q}*,` +
      `genitora.ilike.*${q}*,` +
      `cpf.ilike.*${q}*,` +
      `nascimento.ilike.*${q}*,` +
      `observacoes.ilike.*${q}*`
    )
    .order("nome")
    .limit(100);

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
