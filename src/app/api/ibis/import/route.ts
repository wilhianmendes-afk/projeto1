import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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
      genitora?: string;
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

  const service = getAdminClient();
  let imported = 0, skipped = 0, errors = 0, photos_saved = 0, photo_errors = 0;
  const errorMessages: string[] = [];

  for (const p of pessoas) {
    if (!p.nome?.trim() || !p.foto_base64) { skipped++; continue; }

    // Upload da foto primeiro (antes do check de duplicata, para poder atualizar)
    let storedPhotoUrl: string | null = null;

    if (p.foto_base64) {
      const photoBuffer = Buffer.from(p.foto_base64, "base64");
      // Sanitiza o nome do arquivo: decodifica encoding existente e remove caracteres problemáticos
      const rawId = p.fonte_id ?? `${Date.now()}_${crypto.randomUUID()}`;
      const safeId = decodeURIComponent(rawId).replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `ibis/${safeId}.jpg`;
      const { error: uploadError } = await service.storage
        .from("faces").upload(filename, photoBuffer, { contentType: "image/jpeg", upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = service.storage.from("faces").getPublicUrl(filename);
        storedPhotoUrl = publicUrl;
      } else {
        photo_errors++;
      }
    }

    // Verifica duplicata — por fonte_id (com foto) ou nome+nascimento (sem foto)
    {
      type ExistingRow = { id: string; foto_url: string | null; vulgo: string | null; genitora: string | null; nascimento: string | null };
      let existing: ExistingRow | null = null;

      if (p.fonte_id) {
        const { data } = await service
          .from("qualificados").select("id, foto_url, vulgo, genitora, nascimento")
          .eq("fonte", "ibis").eq("fonte_id", p.fonte_id).maybeSingle();
        existing = data as ExistingRow | null;
      } else {
        // Sem fonte_id: deduplica por nome (case-insensitive) + nascimento quando disponível
        const nascNorm = p.nascimento?.match(/^\d{2}\/\d{2}\/\d{4}$/)
          ? p.nascimento.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")
          : p.nascimento?.trim() || null;
        let q = service.from("qualificados")
          .select("id, foto_url, vulgo, genitora, nascimento")
          .eq("fonte", "ibis").ilike("nome", p.nome.trim());
        if (nascNorm) q = (q as typeof q).eq("nascimento", nascNorm);
        const { data } = await q.maybeSingle();
        existing = data as ExistingRow | null;
      }

      if (existing) {
        // Preenche campos vazios sem sobrescrever dados existentes
        const updates: Record<string, string> = {};
        if (storedPhotoUrl)       { updates.foto_url   = storedPhotoUrl; photos_saved++; }
        if (!existing.vulgo      && p.alcunha?.trim())    { updates.vulgo      = p.alcunha.trim(); }
        if (!existing.genitora   && p.genitora?.trim())   { updates.genitora   = p.genitora.trim(); }
        if (!existing.nascimento && p.nascimento?.trim()) {
          updates.nascimento = p.nascimento.match(/^\d{2}\/\d{2}\/\d{4}$/)
            ? p.nascimento.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")
            : p.nascimento.trim();
        }
        if (Object.keys(updates).length > 0)
          await service.from("qualificados").update(updates).eq("id", existing.id);
        skipped++;
        continue;
      }
    }

    const { error: insertError } = await service
      .from("qualificados")
      .insert({
        nome:      p.nome.trim(),
        vulgo:     p.alcunha?.trim()  || null,
        genitora:  p.genitora?.trim() || null,
        rg:        p.rg?.trim()       || null,
        cpf:       p.cpf?.trim()      || null,
        nascimento: p.nascimento?.match(/^\d{2}\/\d{2}\/\d{4}$/)
          ? p.nascimento.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")
          : p.nascimento || null,
        foto_url:  storedPhotoUrl,
        fonte:     "ibis",
        fonte_id:  p.fonte_id         || null,
      });

    if (insertError) { errors++; errorMessages.push(insertError.message); continue; }
    if (storedPhotoUrl) photos_saved++;
    imported++;
  }

  return NextResponse.json(
    { ok: true, imported, skipped, errors, photos_saved, photo_errors, errorMessages: errorMessages.slice(0, 3) },
    { headers: CORS_HEADERS }
  );
}
