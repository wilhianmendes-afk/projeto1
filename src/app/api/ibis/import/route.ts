import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ibis-Token",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("X-Ibis-Token") || req.headers.get("authorization")?.replace("Bearer ", "");
  const expectedToken = process.env.IBIS_IMPORT_TOKEN;

  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await req.json();
  const { pessoas } = body as {
    pessoas: Array<{
      nome: string;
      alcunha?: string;
      rg?: string;
      cpf?: string;
      nascimento?: string;
      foto_base64?: string;
      fonte_id?: string;
    }>;
  };

  if (!Array.isArray(pessoas) || pessoas.length === 0) {
    return NextResponse.json({ error: "pessoas[] obrigatório" }, { status: 400, headers: CORS_HEADERS });
  }

  const service = await createServiceClient();
  let imported = 0, skipped = 0, errors = 0, photos_saved = 0, photo_errors = 0;

  for (const p of pessoas) {
    if (!p.nome?.trim()) { skipped++; continue; }

    if (p.fonte_id) {
      const { data: existing } = await service
        .from("qualificados").select("id")
        .eq("fonte", "ibis").eq("fonte_id", p.fonte_id).maybeSingle();
      if (existing) { skipped++; continue; }
    }

    let storedPhotoUrl: string | null = null;
    let uploadErr: string | null = null;

    if (p.foto_base64) {
      const photoBuffer = Buffer.from(p.foto_base64, "base64");
      const filename = `ibis/${p.fonte_id ?? Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await service.storage
        .from("faces").upload(filename, photoBuffer, { contentType: "image/jpeg", upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = service.storage.from("faces").getPublicUrl(filename);
        storedPhotoUrl = publicUrl;
        photos_saved++;
      } else {
        uploadErr = uploadError.message;
        photo_errors++;
      }
    }

    const { error: insertError } = await service
      .from("qualificados")
      .insert({
        nome: p.nome.trim(),
        vulgo: p.alcunha?.trim() || null,
        rg: p.rg?.trim() || null,
        cpf: p.cpf?.trim() || null,
        nascimento: p.nascimento || null,
        foto_url: storedPhotoUrl,
        fonte: "ibis",
        fonte_id: p.fonte_id || null,
      });

    if (insertError) { errors++; continue; }
    imported++;
  }

  return NextResponse.json(
    { ok: true, imported, skipped, errors, photos_saved, photo_errors },
    { headers: CORS_HEADERS }
  );
}
