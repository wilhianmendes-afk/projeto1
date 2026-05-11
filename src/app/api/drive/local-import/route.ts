import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedImage } from "@/lib/face-service";
import Anthropic from "@anthropic-ai/sdk";

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

async function ocr(buffer: Buffer, mimeType: string) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const validMime = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
      ? mimeType : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: validMime, data: buffer.toString("base64") },
          },
          {
            type: "text",
            text: `Leia TODO o texto visível nesta imagem — incluindo legenda, rodapé e qualquer área de texto fora da foto principal. Extraia dados pessoais de uma pessoa.

Regras de mapeamento:
- nome = nome civil completo (primeira linha sem prefixo, ou após NOME: / AUTUADO:)
- vulgo = apelido/alcunha (VULGO:, ALCUNHA:, APELIDO:)
- nascimento = data de nascimento (DN:, DATA NASC:) — formato DD/MM/AAAA
- genitora = nome da mãe (GN:, MÃE:, GENITORA:)
- cpf, rg, cidade, uf, artigos, faccao, observacoes = outros dados se presentes

Retorne APENAS JSON válido sem markdown:
{"nome":null,"vulgo":null,"cpf":null,"rg":null,"nascimento":null,"genitora":null,"cidade":null,"uf":null,"artigos":null,"faccao":null,"observacoes":null}

Se não houver nenhum nome de pessoa visível, retorne: {"nome":null}`,
          },
        ],
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { nome: null, _ocr_raw: raw.slice(0, 300) };
    return { ...JSON.parse(match[0]), _ocr_raw: raw.slice(0, 300) };
  } catch (err) {
    return { nome: null, _ocr_error: String(err) };
  }
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
  const dados = nomeManual
    ? {
        nome: nomeManual,
        vulgo: (formData.get("vulgo") as string | null)?.trim() || null,
        nascimento: (formData.get("nascimento") as string | null)?.trim() || null,
        genitora: (formData.get("genitora") as string | null)?.trim() || null,
        rg: (formData.get("rg") as string | null)?.trim() || null,
        cpf: (formData.get("cpf") as string | null)?.trim() || null,
        cidade: null,
        uf: null,
        faccao: null,
        artigos: null,
        observacoes: (formData.get("observacoes") as string | null)?.trim() || null,
      }
    : await ocr(buffer, mimeType);

  if (!dados.nome) {
    return NextResponse.json({
      status: "sem_dados",
      reason: dados._ocr_error ?? "no_name_found",
      ocr_raw: dados._ocr_raw ?? null,
    });
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

  // Monta observações completas com facção e artigos se não tiverem campo próprio
  const obsPartes: string[] = [];
  if (dados.faccao)     obsPartes.push(`Facção: ${dados.faccao}`);
  if (dados.artigos)    obsPartes.push(`Artigos: ${dados.artigos}`);
  if (dados.observacoes) obsPartes.push(dados.observacoes);
  const observacoesFinal = obsPartes.join("\n") || null;

  // Insere qualificado com todos os campos extraídos
  const { data: qualificado, error: insertError } = await supabase
    .from("qualificados")
    .insert({
      nome: dados.nome,
      vulgo: dados.vulgo ?? null,
      cpf: dados.cpf ?? null,
      rg: dados.rg ?? null,
      nascimento: dados.nascimento ?? null,
      genitora: dados.genitora ?? null,
      cidade: dados.cidade ?? null,
      uf: dados.uf ?? null,
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
          source_label: dados.nome,
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
        source_label: dados.nome,
        reason: "no_face_detected",
      }, { onConflict: "source,source_id" });
    }
  } catch { /* face service indisponível, importa sem embedding */ }

  return NextResponse.json({
    status: "imported",
    id: qualificado.id,
    nome: dados.nome,
    vulgo: dados.vulgo ?? null,
    cpf: dados.cpf ?? null,
    nascimento: dados.nascimento ?? null,
    cidade: dados.cidade ?? null,
  });
}
