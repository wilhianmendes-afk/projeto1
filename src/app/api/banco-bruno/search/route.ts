import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BRUNO_URL = process.env.BANCO_BRUNO_URL!;
const BRUNO_TOKEN = process.env.BANCO_BRUNO_TOKEN!;

interface BrunoMatch {
  id: string;
  nome: string;
  vulgo?: string | null;
  cpf?: string | null;
  genitora?: string | null;
  dn?: string | null;
  cidade?: string | null;
  foto_original_url?: string | null;
  composite_url?: string | null;
  faccao?: string | null;
  artigos?: string | null;
  observacoes?: string | null;
}

interface BrunoDriveFile {
  name: string;
  web_view_url: string;
  thumbnail_url?: string | null;
}

interface BrunoSearchResult {
  matches: BrunoMatch[];
  drive_files?: BrunoDriveFile[];
  drive_total?: number;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ matches: [], drive_files: [] });

  try {
    const res = await fetch(BRUNO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRUNO_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "search_text", arguments: { query: q, limit: 20 } },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return NextResponse.json({ matches: [], drive_files: [] });

    const data = await res.json();
    const text = data?.result?.content?.[0]?.text;
    if (!text) return NextResponse.json({ matches: [], drive_files: [] });

    const parsed = JSON.parse(text) as BrunoSearchResult;
    return NextResponse.json({
      matches: parsed.matches ?? [],
      drive_files: parsed.drive_files ?? [],
      drive_total: parsed.drive_total ?? 0,
    });
  } catch {
    return NextResponse.json({ matches: [], drive_files: [] });
  }
}
