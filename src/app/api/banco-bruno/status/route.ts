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
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function GET() {
  try {
    const status = await callBrunoTool("get_banco_status");
    if (status) return NextResponse.json({ ok: true, ...status });

    // Se get_banco_status não existir, faz busca ampla para estimar
    const sample = await callBrunoTool("search_text", { query: "a", limit: 1 });
    return NextResponse.json({ ok: true, total_qualificados: sample?.total ?? null, estimado: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
