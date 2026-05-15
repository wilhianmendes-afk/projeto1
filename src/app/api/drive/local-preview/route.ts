import { NextRequest, NextResponse } from "next/server";
import { getDriveClient, ocrImageBuffer } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMPORT_TOKEN = process.env.IBIS_IMPORT_TOKEN;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-import-token");
  if (auth !== IMPORT_TOKEN) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  const drive = getDriveClient();
  const dados = await ocrImageBuffer(drive, buffer, mimeType);

  return NextResponse.json({
    nome: dados.nome,
    genitora: dados.genitora,
    nascimento: dados.nascimento,
    vulgo: dados.vulgo,
    cpf: dados.cpf,
    observacoes: dados.observacoes,
    _erro: dados._erro ?? null,   // visível no console do browser para diagnóstico
  });
}
