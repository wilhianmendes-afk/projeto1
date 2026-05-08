import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage, healthCheck } from "@/lib/face-service";

export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Backfill-Token",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

// DELETE: limpa todos os face_skipped para reprocessar
export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: CORS_HEADERS });
  }

  const service = getAdminClient();
  const { error } = await service
    .from("face_skipped")
    .delete()
    .eq("source", "qualificados");

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function isAuthorized(req: NextRequest): boolean {
  // Aceita token de cron/automação
  const token = req.headers.get("x-backfill-token") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (token && token === process.env.IBIS_IMPORT_TOKEN) return true;
  // Aceita chamada interna do Vercel Cron
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

async function runBackfill(limit: number) {
  const service = getAdminClient();

  // healthCheck e queries do Supabase em paralelo para não desperdiçar tempo
  const [serviceOnline, { data: alreadyIndexed }, { data: alreadySkipped }, { data: pendentes }] =
    await Promise.all([
      healthCheck(),
      service.from("face_embeddings").select("source_id").eq("source", "qualificados").limit(50000),
      service.from("face_skipped").select("source_id").eq("source", "qualificados").limit(10000),
      service.from("qualificados").select("id, nome, foto_url, fotos_extras")
        .is("deleted_at", null).not("foto_url", "is", null).limit(10000),
    ]);

  if (!serviceOnline) {
    return NextResponse.json(
      { ok: false, error: "Face service offline. Verifique o Railway.", processed: 0, embedded: 0, skipped: 0, remaining: -1 },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  const done = new Set([
    ...(alreadyIndexed ?? []).map((r: { source_id: string }) => r.source_id),
    ...(alreadySkipped ?? []).map((r: { source_id: string }) => r.source_id),
  ]);

  const allPending = (pendentes ?? []).filter((p: { id: string }) => !done.has(p.id));
  const queue = allPending.slice(0, limit);

  let processed = 0, embedded = 0, skipped = 0;

  for (const pessoa of queue) {
    const urls: string[] = [pessoa.foto_url, ...((pessoa.fotos_extras as string[]) ?? [])].filter(Boolean);
    let pessoaEmbedded = 0;
    let serviceError = false;

    for (const url of urls) {
      let buffer: Buffer;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error("HTTP " + res.status);
        buffer = Buffer.from(await res.arrayBuffer());
      } catch { continue; }

      let embedResponse;
      try {
        embedResponse = await embedImage(buffer);
      } catch {
        serviceError = true; // face service indisponível — não marcar como sem rosto
        continue;
      }

      for (let faceIndex = 0; faceIndex < embedResponse.faces.length; faceIndex++) {
        const face = embedResponse.faces[faceIndex];
        const { error: upsertErr } = await service.from("face_embeddings").upsert({
          source: "qualificados", source_id: pessoa.id, source_label: pessoa.nome,
          photo_url: url, embedding: JSON.stringify(face.embedding),
          bbox: face.bbox, det_score: face.det_score, face_index: faceIndex,
        }, { onConflict: "source,source_id,photo_url,face_index", ignoreDuplicates: true });
        if (!upsertErr) pessoaEmbedded++;
      }
    }

    if (pessoaEmbedded === 0 && !serviceError) {
      // Foto processada com sucesso mas sem rosto detectado
      await service.from("face_skipped").upsert({
        source: "qualificados", source_id: pessoa.id,
        source_label: pessoa.nome, reason: "no_face_detected",
      }, { onConflict: "source,source_id" });
      skipped++;
    } else if (pessoaEmbedded > 0) {
      embedded += pessoaEmbedded;
    }
    // serviceError && pessoaEmbedded === 0 → permanece pendente, será reprocessado
    processed++;
  }

  return NextResponse.json({
    ok: true, processed, embedded, skipped,
    total_pending: allPending.length,
    remaining: allPending.length - processed,
  }, { headers: CORS_HEADERS });
}

// GET: chamada manual pelo browser logado
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: CORS_HEADERS });
  }
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "3");
  return runBackfill(limit);
}

// POST: chamada do cron, do script de importação ou do sistema
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: CORS_HEADERS });
  }
  const body = await req.json().catch(() => ({}));
  const limit = body.limit ?? 3;
  return runBackfill(limit);
}
