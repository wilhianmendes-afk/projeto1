import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { embedImage } from "@/lib/face-service";

export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ibis-Token",
};

// Preflight CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  // Auth via token estático (usado pelo script do navegador)
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
      genitora?: string;
      foto_base64?: string;
      foto_url?: string;
      fonte_id?: string;
    }>;
  };

  if (!Array.isArray(pessoas) || pessoas.length === 0) {
    return NextResponse.json({ error: "pessoas[] obrigatório" }, { status: 400, headers: CORS_HEADERS });
  }

  const service = await createServiceClient();
  let imported = 0, skipped = 0, errors = 0;

  for (const p of pessoas) {
    if (!p.nome?.trim()) { skipped++; continue; }

    if (p.fonte_id) {
      const { data: existing } = await service
        .from("qualificados").select("id")
        .eq("fonte", "ibis").eq("fonte_id", p.fonte_id).maybeSingle();
      if (existing) { skipped++; continue; }
    }

    let photoBuffer: Buffer | null = null;
    let storedPhotoUrl: string | null = null;

    if (p.foto_base64) {
      photoBuffer = Buffer.from(p.foto_base64, "base64");
      const filename = `ibis/${p.fonte_id ?? Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await service.storage
        .from("faces").upload(filename, photoBuffer, { contentType: "image/jpeg", upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = service.storage.from("faces").getPublicUrl(filename);
        storedPhotoUrl = publicUrl;
      }
    }

    const { data: qualificado, error: insertError } = await service
      .from("qualificados")
      .insert({ nome: p.nome.trim(), vulgo: p.alcunha?.trim() || null, rg: p.rg?.trim() || null, cpf: p.cpf?.trim() || null, nascimento: p.nascimento || null, foto_url: storedPhotoUrl, fonte: "ibis", fonte_id: p.fonte_id || null })
      .select("id").single();

    if (insertError || !qualificado) { errors++; continue; }

    if (photoBuffer && storedPhotoUrl) {
      let embedResponse;
      try { embedResponse = await embedImage(photoBuffer, `${p.nome}.jpg`); }
      catch { imported++; continue; }

      if (embedResponse.count > 0) {
        const face = embedResponse.faces[0];
        await service.from("face_embeddings").insert({
          source: "qualificados", source_id: qualificado.id, source_label: p.nome,
          photo_url: storedPhotoUrl, embedding: JSON.stringify(face.embedding),
          bbox: face.bbox, det_score: face.det_score, face_index: 0,
        });
      } else {
        await service.from("face_skipped").upsert({
          source: "qualificados", source_id: qualificado.id,
          source_label: p.nome, reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
      }
    }
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped, errors }, { headers: CORS_HEADERS });
}
