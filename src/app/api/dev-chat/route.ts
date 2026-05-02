import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireAuth(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

async function callAssistant(history: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "Você é um assistente de desenvolvimento embarcado na aplicação Intel Facial 42º BPM.\n\n" +
        "Stack: Next.js 14 (App Router, Vercel) + Supabase (Postgres + pgvector + Storage + Auth) + " +
        "FastAPI + InsightFace buffalo_l (Railway).\n\n" +
        "Produção: https://projeto1-liard-one.vercel.app\n" +
        "Face service: https://projeto1-production-b575.up.railway.app\n\n" +
        "Responda em português, seja técnico e conciso.",
      messages: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getAdminClient();
  const { data, error } = await db
    .from("dev_chat_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getAdminClient();
  const formData = await req.formData();
  const content = (formData.get("content") as string | null) ?? "";
  const files = formData.getAll("files") as File[];

  // Ensure dev-chat bucket exists
  await db.storage.createBucket("dev-chat", { public: true }).catch(() => {});

  // Upload attachments
  const attachments: { name: string; url: string; type: string; size: number }[] = [];
  for (const file of files) {
    if (!file.name) continue;
    const path = `attachments/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: up, error: upErr } = await db.storage
      .from("dev-chat")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (!upErr && up) {
      const { data: { publicUrl } } = db.storage.from("dev-chat").getPublicUrl(up.path);
      attachments.push({ name: file.name, url: publicUrl, type: file.type, size: file.size });
    }
  }

  // Save user message
  const { error: insertErr } = await db
    .from("dev_chat_messages")
    .insert({ role: "user", content: content || "(anexo)", attachments });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Fetch history for assistant context
  const { data: history } = await db
    .from("dev_chat_messages")
    .select("role, content")
    .order("created_at", { ascending: true })
    .limit(40);

  // Generate and persist assistant response
  try {
    const reply = await callAssistant(history ?? []);
    if (reply) {
      await db.from("dev_chat_messages").insert({
        role: "assistant",
        content: reply,
        attachments: [],
      });
    }
  } catch (e) {
    await db.from("dev_chat_messages").insert({
      role: "assistant",
      content: `⚠️ Erro ao gerar resposta: ${e instanceof Error ? e.message : "desconhecido"}`,
      attachments: [],
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
