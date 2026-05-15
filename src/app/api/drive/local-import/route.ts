import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";
import { getDriveClient, ocrImageBuffer } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMPORT_TOKEN = process.env.IBIS_IMPORT_TOKEN;

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}


export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-import-token");
  if (auth !== IMPORT_TOKEN) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const fileHash = formData.get("file_hash") as string | null;
  const fileName = formData.get("file_name") as string | null;

  if (!file || !fileHash) {
    return NextResponse.json({ error: "file e file_hash obrigatórios" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Deduplicação por hash do arquivo
  const { data: existing } = await supabase
    .from("qualificados")
    .select("id")
    .eq("fonte", "local_drive")
    .eq("fonte_id", fileHash)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: "skipped", reason: "already_imported" });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  // Dados manuais têm prioridade sobre OCR (bypass quando nome já vem no form)
  const nomeManual = (formData.get("nome") as string | null)?.trim() || null;

  let nomeFinal: string;
  let observacoesFinal: string | null = null;

  if (nomeManual) {
    nomeFinal = nomeManual;
    const obsManual = (formData.get("observacoes") as string | null)?.trim() || null;
    const genitora = (formData.get("genitora") as string | null)?.trim() || null;
    const nascimento = (formData.get("nascimento") as string | null)?.trim() || null;
    const vulgo = (formData.get("vulgo") as string | null)?.trim() || null;
    const partes = [nomeManual, vulgo && `VULGO: ${vulgo}`, nascimento && `DN: ${nascimento}`, genitora && `GN: ${genitora}`, obsManual].filter(Boolean);
    observacoesFinal = partes.join("\n") || null;
  } else {
    const drive = getDriveClient();
    const dados = await ocrImageBuffer(drive, buffer, mimeType);
    observacoesFinal = dados.observacoes ?? null;
    nomeFinal = dados.nome ?? observacoesFinal?.split("\n")[0]?.trim() ?? fileName ?? "SEM NOME";
  }

  // Upload para Storage
  const storagePath = `drive/local/${fileHash}/${fileName ?? file.name}`;
  const { error: uploadError } = await supabase.storage.from("faces").upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) {
    return NextResponse.json({ error: "Erro no upload: " + uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("faces").getPublicUrl(storagePath);

  // Insere qualificado — observacoes contém TODO o texto OCR da foto (pesquisável)
  const { data: qualificado, error: insertError } = await supabase
    .from("qualificados")
    .insert({
      nome: nomeFinal,
      observacoes: observacoesFinal,
      foto_url: publicUrl,
      fonte: "local_drive",
      fonte_id: fileHash,
    })
    .select("id")
    .single();

  if (insertError || !qualificado) {
    return NextResponse.json({ error: "Erro ao inserir: " + insertError?.message }, { status: 500 });
  }

  // Indexação facial (best-effort)
  try {
    const embedResponse = await embedImage(buffer, fileName ?? "photo.jpg");
    if (embedResponse.count > 0) {
      for (let i = 0; i < embedResponse.faces.length; i++) {
        const face = embedResponse.faces[i];
        await supabase.from("face_embeddings").insert({
          source: "qualificados",
          source_id: qualificado.id,
          source_label: nomeFinal,
          photo_url: publicUrl,
          embedding: JSON.stringify(face.embedding),
          bbox: face.bbox,
          det_score: face.det_score,
          face_index: i,
        });
      }
    } else {
      await supabase.from("face_skipped").upsert({
        source: "qualificados",
        source_id: qualificado.id,
        source_label: nomeFinal,
        reason: "no_face_detected",
      }, { onConflict: "source,source_id" });
    }
  } catch { /* face service indisponível, importa sem embedding */ }

  return NextResponse.json({
    status: "imported",
    id: qualificado.id,
    nome: nomeFinal,
  });
}
