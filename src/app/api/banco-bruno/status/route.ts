import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BRUNO_URL = process.env.BANCO_BRUNO_URL!;
const BRUNO_TOKEN = process.env.BANCO_BRUNO_TOKEN!;

async function callBrunoTool(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(BRUNO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRUNO_TOKEN}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name, arguments: args },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function GET() {
  try {
    const s = await callBrunoTool("get_banco_status");
    if (s?.banco) {
      return NextResponse.json({
        ok: true,
        total_qualificados: s.banco.pessoas_unicas ?? null,
        faces_total: s.banco.faces_buscaveis_total ?? null,
        faces_banco: s.banco.faces_banco ?? null,
        faces_drive: s.banco.faces_drive ?? null,
        ibis_online: s.ibis_scraper?.online ?? false,
        cadastrados_hoje: s.ibis_scraper?.cadastrados_hoje ?? 0,
      });
    }
    return NextResponse.json({ ok: false });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
