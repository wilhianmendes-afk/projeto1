import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedImage } from "@/lib/face-service";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
    return NextResponse.json({ error: "pessoas[] obrigatório" }, { status: 400 });
  }

  const service = await createServiceClient();
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of pessoas) {
    if (!p.nome?.trim()) { skipped++; continue; }

    // Evita duplicata por fonte_id
    if (p.fonte_id) {
      const { data: existing } = await service
        .from("qualificados")
        .select("id")
        .eq("fonte", "ibis")
        .eq("fonte_id", p.fonte_id)
        .maybeSingle();
      if (existing) { skipped++; continue; }
    }

    let photoBuffer: Buffer | null = null;
    let storedPhotoUrl: string | null = null;

    if (p.foto_base64) {
      photoBuffer = Buffer.from(p.foto_base64, "base64");
      const filename = `ibis/${p.fonte_id ?? Date.now()}.jpg`;
      const { error: uploadError } = await service.storage
        .from("faces")
        .upload(filename, photoBuffer, { contentType: "image/jpeg", upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = service.storage.from("faces").getPublicUrl(filename);
        storedPhotoUrl = publicUrl;
      }
    }

    const { data: qualificado, error: insertError } = await service
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
      })
      .select("id")
      .single();

    if (insertError || !qualificado) { errors++; continue; }

    if (photoBuffer && storedPhotoUrl) {
      let embedResponse;
      try {
        embedResponse = await embedImage(photoBuffer, `${p.nome}.jpg`);
      } catch { errors++; imported++; continue; }

      if (embedResponse.count > 0) {
        const face = embedResponse.faces[0];
        await service.from("face_embeddings").insert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: p.nome,
          photo_url: storedPhotoUrl,
          embedding: JSON.stringify(face.embedding),
          bbox: face.bbox,
          det_score: face.det_score,
          face_index: 0,
        });
      } else {
        await service.from("face_skipped").upsert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: p.nome,
          reason: "no_face_detected",
        }, { onConflict: "source,source_id" });
      }
    }

    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped, errors });
}
