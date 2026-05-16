import { google } from "googleapis";

export function getDriveClient() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  return google.drive({ version: "v3", auth });
}

// Interpreta o texto extraído pelo OCR do Google Drive.
// Suporta dois formatos encontrados nas fotos:
//   Formato A (abordagem): "NOME COMPLETO\nGN:MÃE\nDN:DD/MM/AAAA"
//   Formato B (ficha):     "Nome NOME\nMãe MÃE\nData Nascimento DD/MM/AAAA"
export function parseOcrText(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let nome: string | null = null;
  let genitora: string | null = null;
  let nascimento: string | null = null;
  let vulgo: string | null = null;
  let cpf: string | null = null;

  for (const line of lines) {
    // Genitora — formato A: "GN:" | formato B: "Mãe " / "Mae "
    if (/^GN\s*[:\-]/i.test(line)) {
      genitora = line.replace(/^GN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^M(?:ã|a)e\s+/i.test(line)) {
      genitora = line.replace(/^M(?:ã|a)e\s+/i, "").trim() || null;

    // Nascimento — formato A: "DN:" | formato B: "Data Nascimento " / "Nascimento "
    } else if (/^DN\s*[:\-]/i.test(line)) {
      nascimento = line.replace(/^DN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^(?:Data\s+)?Nascimento\s*[:\s]/i.test(line)) {
      nascimento = line.replace(/^(?:Data\s+)?Nascimento\s*[:\s]\s*/i, "").trim() || null;

    // Vulgo
    } else if (/^(?:VULGO|VG)\s*[:\-]/i.test(line)) {
      vulgo = line.replace(/^(?:VULGO|VG)\s*[:\-]\s*/i, "").trim() || null;

    // CPF
    } else if (/^CPF\s*[:\-]/i.test(line)) {
      cpf = line.replace(/^CPF\s*[:\-]\s*/i, "").trim() || null;

    // Nome — formato A: linha toda maiúscula sem prefixo
    //         formato B: prefixo "Nome "
    } else if (/^Nome\s+/i.test(line)) {
      nome = line.replace(/^Nome\s+/i, "").trim() || null;
    } else if (!nome && line.length > 3 && /^[A-ZÁÀÃÂÉÊÍÓÕÔÚÇ][A-ZÁÀÃÂÉÊÍÓÕÔÚÇ\s]+$/.test(line)) {
      nome = line;
    }
  }

  const observacoes = lines.join("\n") || null;
  return { nome, genitora, nascimento, vulgo, cpf, observacoes };
}

// OCR de um fileId já existente no Drive (usado pelo auto-sync).
// OCR de um fileId já existente no Drive via OCR.space:
// baixa o buffer e envia como base64 — sem criar nada no Drive.
export async function ocrDriveFile(
  drive: ReturnType<typeof getDriveClient>,
  fileId: string
) {
  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    return await ocrImageBuffer(buffer);
  } catch {
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null };
  }
}

// OCR de um buffer local via OCR.space API (gratuito, 25k req/mês).
// Variável de ambiente: OCR_SPACE_API_KEY (cadastro gratuito em ocr.space/ocrapi)
export async function ocrImageBuffer(
  buffer: Buffer,
): Promise<{ nome: string | null; genitora: string | null; nascimento: string | null; vulgo: string | null; cpf: string | null; observacoes: string | null; _erro?: string }> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null, _erro: "OCR_SPACE_API_KEY não configurada" };
  }
  try {
    const form = new FormData();
    form.append("apikey", apiKey);
    form.append("language", "por");
    form.append("OCREngine", "2");
    form.append("detectOrientation", "true");
    form.append("scale", "true");
    form.append("isTable", "false");
    form.append(
      "base64Image",
      `data:image/jpeg;base64,${buffer.toString("base64")}`,
    );

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
    });

    const data = await res.json() as {
      IsErroredOnProcessing: boolean;
      ErrorMessage?: string[];
      ParsedResults?: Array<{ ParsedText: string }>;
    };

    if (data.IsErroredOnProcessing) {
      return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null, _erro: data.ErrorMessage?.[0] ?? "OCR.space retornou erro" };
    }

    const text = data.ParsedResults?.[0]?.ParsedText ?? "";
    if (!text.trim()) {
      return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null, _erro: "Sem texto detectado na imagem" };
    }

    return parseOcrText(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null, _erro: msg };
  }
}
