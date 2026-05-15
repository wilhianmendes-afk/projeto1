import { google } from "googleapis";
import { Readable } from "stream";

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
// Formato esperado nas fotos (dados editados na imagem):
//   NOME COMPLETO
//   GN:NOME DA MÃE
//   DN:DD/MM/AAAA
//   VULGO:APELIDO  (opcional)
export function parseOcrText(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let nome: string | null = null;
  let genitora: string | null = null;
  let nascimento: string | null = null;
  let vulgo: string | null = null;
  let cpf: string | null = null;

  for (const line of lines) {
    if (/^GN\s*[:\-]/i.test(line)) {
      genitora = line.replace(/^GN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^DN\s*[:\-]/i.test(line)) {
      nascimento = line.replace(/^DN\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^(?:VULGO|VG)\s*[:\-]/i.test(line)) {
      vulgo = line.replace(/^(?:VULGO|VG)\s*[:\-]\s*/i, "").trim() || null;
    } else if (/^CPF\s*[:\-]/i.test(line)) {
      cpf = line.replace(/^CPF\s*[:\-]\s*/i, "").trim() || null;
    } else if (!nome && line.length > 3 && /^[A-ZÁÀÃÂÉÊÍÓÕÔÚÇ][A-ZÁÀÃÂÉÊÍÓÕÔÚÇ\s]+$/.test(line)) {
      nome = line;
    }
  }

  const observacoes = lines.join("\n") || null;
  return { nome, genitora, nascimento, vulgo, cpf, observacoes };
}

// OCR de um fileId já existente no Drive (usado pelo auto-sync).
export async function ocrDriveFile(
  drive: ReturnType<typeof getDriveClient>,
  fileId: string
) {
  let docId: string | null = null;
  try {
    const { data: doc } = await drive.files.copy({
      fileId,
      requestBody: { mimeType: "application/vnd.google-apps.document" },
    });
    docId = doc.id ?? null;

    const { data: text } = await drive.files.export({
      fileId: docId!,
      mimeType: "text/plain",
    });

    return parseOcrText(String(text || ""));
  } catch {
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null };
  } finally {
    if (docId) await drive.files.delete({ fileId: docId }).catch(() => {});
  }
}

// OCR de um buffer local: faz upload temporário no Drive da service account,
// extrai o texto via Google Doc e limpa os arquivos temporários.
export async function ocrImageBuffer(
  drive: ReturnType<typeof getDriveClient>,
  buffer: Buffer,
  mimeType: string
) {
  let uploadedId: string | null = null;
  let docId: string | null = null;
  try {
    // 1. Faz upload do buffer para o Drive da service account
    const { data: uploaded } = await drive.files.create({
      requestBody: { name: `_ocr_tmp_${Date.now()}`, mimeType },
      media: { mimeType, body: Readable.from(buffer) },
      fields: "id",
    });
    uploadedId = uploaded.id ?? null;

    // 2. Copia como Google Doc (aplica OCR automaticamente)
    const { data: doc } = await drive.files.copy({
      fileId: uploadedId!,
      requestBody: { mimeType: "application/vnd.google-apps.document" },
    });
    docId = doc.id ?? null;

    // 3. Exporta o texto puro
    const { data: text } = await drive.files.export({
      fileId: docId!,
      mimeType: "text/plain",
    });

    return parseOcrText(String(text || ""));
  } catch {
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null };
  } finally {
    // 4. Limpa os dois arquivos temporários
    if (docId) await drive.files.delete({ fileId: docId }).catch(() => {});
    if (uploadedId) await drive.files.delete({ fileId: uploadedId }).catch(() => {});
  }
}
