import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";

export const dynamic = "force-dynamic";

const MCP_TOKEN = process.env.MCP_BANCO_TOKEN;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const TOOLS = [
  {
    name: "search_text",
    description:
      "Busca textual no banco de qualificados da 42ª BPM por nome, CPF, vulgo, nome da mãe ou observações. Retorna até 20 fichas com foto e dados básicos.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca: nome, CPF, vulgo, etc." },
        limit: { type: "number", description: "Máximo de resultados (default 10, max 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_qualificado",
    description: "Retorna ficha completa de um qualificado pelo ID (UUID).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do qualificado" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_face",
    description:
      "Busca por similaridade facial no banco da 42ª BPM. Envie uma URL pública de imagem. Retorna matches ordenados por similaridade.",
    inputSchema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "URL pública da imagem com o rosto" },
        threshold: { type: "number", description: "Similaridade mínima (0–1, default 0.40)" },
        limit: { type: "number", description: "Máximo de resultados (default 10, max 30)" },
      },
      required: ["image_url"],
    },
  },
  {
    name: "get_banco_status",
    description:
      "Retorna estatísticas do banco da 42ª BPM: total de qualificados, indexados, sem foto, cobertura facial.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const supabase = getAdminClient();

  if (name === "search_text") {
    const { query, limit = 10 } = args as { query: string; limit?: number };
    const lim = Math.min(Number(limit), 50);
    const q = String(query).replace(/[%_]/g, "\\$&");

    const { data, error } = await supabase
      .from("qualificados")
      .select("id, nome, vulgo, cpf, nascimento, genitora, cidade, uf, foto_url, observacoes, fonte, created_at")
      .or(
        `nome.ilike.%${q}%,vulgo.ilike.%${q}%,cpf.ilike.%${q}%,genitora.ilike.%${q}%,observacoes.ilike.%${q}%`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(lim);

    if (error) throw new Error(error.message);
    return JSON.stringify({ matches: data ?? [], total: data?.length ?? 0 });
  }

  if (name === "get_qualificado") {
    const { id } = args as { id: string };
    const { data, error } = await supabase
      .from("qualificados")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) throw new Error(error.message);
    return JSON.stringify(data);
  }

  if (name === "search_face") {
    const { image_url, threshold = 0.4, limit = 10 } = args as {
      image_url: string;
      threshold?: number;
      limit?: number;
    };

    const imgRes = await fetch(String(image_url), { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) throw new Error(`Não foi possível baixar a imagem: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    let embedResponse = await embedImage(buffer, "photo.jpg");
    if (embedResponse.count === 0 && embedResponse.total_detected > 0) {
      embedResponse = await embedImage(buffer, "photo.jpg", 0.35);
    }
    if (embedResponse.count === 0) {
      return JSON.stringify({
        results: [],
        message:
          embedResponse.total_detected === 0
            ? "Nenhum rosto detectado na imagem."
            : "Rosto detectado mas com qualidade baixa.",
      });
    }

    const bestFace = embedResponse.faces.reduce((a, b) =>
      a.det_score > b.det_score ? a : b
    );

    const { data: matches, error } = await supabase.rpc("face_search", {
      query_embedding: JSON.stringify(bestFace.embedding),
      similarity_threshold: Number(threshold),
      match_count: Math.min(Number(limit), 30),
    });

    if (error) throw new Error(error.message);

    const sourceIds = [...new Set((matches ?? []).map((m: { source_id: string }) => m.source_id))];
    let pessoas: Record<string, unknown> = {};
    if (sourceIds.length > 0) {
      const { data } = await supabase
        .from("qualificados")
        .select("id, nome, vulgo, cpf, cidade, uf, nascimento, genitora")
        .in("id", sourceIds);
      pessoas = Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    }

    const results = (matches ?? []).map((m: { source_id: string; similarity: number; photo_url: string; det_score: number; bbox: unknown }) => ({
      ...m,
      pessoa: pessoas[m.source_id] ?? null,
      confidence:
        m.similarity >= 0.55 ? "alta" :
        m.similarity >= 0.42 ? "forte" :
        m.similarity >= 0.30 ? "incerto" : "baixa",
    }));

    return JSON.stringify({ results, total: results.length });
  }

  if (name === "get_banco_status") {
    const { data, error } = await supabase.rpc("get_face_stats");
    if (error) throw new Error(error.message);
    return JSON.stringify(data);
  }

  throw new Error(`Ferramenta não encontrada: ${name}`);
}

type JsonRpcRequest = {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
};

function jsonRpc(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!MCP_TOKEN || auth !== `Bearer ${MCP_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { method, params, id } = body;

  try {
    // MCP handshake
    if (method === "initialize") {
      return jsonRpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "banco-42bpm", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized" || method === "ping") {
      return jsonRpc(id, {});
    }

    // List tools
    if (method === "tools/list") {
      return jsonRpc(id, { tools: TOOLS });
    }

    // Call tool
    if (method === "tools/call") {
      const { name, arguments: args = {} } = (params ?? {}) as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      const text = await callTool(name, args);
      return jsonRpc(id, { content: [{ type: "text", text }] });
    }

    return jsonRpcError(id, -32601, "Method not found");
  } catch (err) {
    return jsonRpcError(id, -32000, err instanceof Error ? err.message : "Internal error");
  }
}

export async function GET() {
  return NextResponse.json({
    name: "banco-42bpm",
    version: "1.0.0",
    description: "MCP Server — Intel Facial 42ª BPM",
    tools: TOOLS.map((t) => t.name),
  });
}
