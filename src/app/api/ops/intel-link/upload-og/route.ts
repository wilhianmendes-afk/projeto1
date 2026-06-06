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

export async function POST(req: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { image } = await req.json();
  if (!image) return NextResponse.json({ error: "Imagem obrigatória" }, { status: 400 });

  const base64 = image.split(",")[1];
  if (!base64) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });

  const buffer = Buffer.from(base64, "base64");
  const filename = `intel-link/og/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const supabase = getAdminClient();
  const { error } = await supabase.storage.from("faces").upload(filename, buffer, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("faces").getPublicUrl(filename);
  return NextResponse.json({ url: publicUrl });
}
