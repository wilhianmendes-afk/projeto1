import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  // Usa fetch direto ao PostgREST — o cliente Supabase JS tem bug com .or()+ilike
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const url = new URL(`${base}/rest/v1/qualificados`);
  url.searchParams.set("select", "id,nome,vulgo,cpf,nascimento,genitora,foto_url,observacoes,fonte");
  url.searchParams.set("deleted_at", "is.null");
  // nascimento é tipo date no Postgres — ilike não funciona em date, removido do or
  url.searchParams.set("or", `(nome.ilike.*${q}*,vulgo.ilike.*${q}*,genitora.ilike.*${q}*,cpf.ilike.*${q}*,observacoes.ilike.*${q}*)`);
  url.searchParams.set("order", "nome");
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json([], { status: res.status });
  return NextResponse.json(await res.json());
}
