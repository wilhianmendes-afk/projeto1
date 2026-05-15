import { google } from "googleapis";
import { Readable } from "stream";

const DRIVE_ROOT_FOLDER = "1XzKRnRfmhQi-wFXgHn2dzG9EOwZdGwAF";

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

// OCR de um buffer local: faz upload temporário na pasta compartilhada do Drive
// (service account precisa ter permissão de Editor na pasta), copia como Google Doc
// para aplicar OCR automático, exporta o texto e deleta os arquivos temporários.
export async function ocrImageBuffer(
  buffer: Buffer,
): Promise<{ nome: string | null; genitora: string | null; nascimento: string | null; vulgo: string | null; cpf: string | null; observacoes: string | null; _erro?: string }> {
  const drive = getDriveClient();
  let uploadedId: string | null = null;
  let docId: string | null = null;
  try {
    // 1. Stream do buffer (googleapis exige readable stream para media upload)
    const stream = new Readable({ read() {} });
    stream.push(buffer);
    stream.push(null);

    // 2. Upload temporário na pasta compartilhada
    const { data: uploaded } = await drive.files.create({
      requestBody: {
        name: `_ocr_tmp_${Date.now()}`,
        mimeType: "image/jpeg",
        parents: [DRIVE_ROOT_FOLDER],
      },
      media: { mimeType: "image/jpeg", body: stream },
      fields: "id",
    });
    uploadedId = uploaded.id ?? null;
    if (!uploadedId) throw new Error("Upload retornou sem ID");

    // 3. Copia como Google Doc (aplica OCR automaticamente)
    const { data: doc } = await drive.files.copy({
      fileId: uploadedId,
      requestBody: { mimeType: "application/vnd.google-apps.document" },
    });
    docId = doc.id ?? null;
    if (!docId) throw new Error("Copy retornou sem ID");

    // 4. Exporta o texto puro
    const { data: text } = await drive.files.export({
      fileId: docId,
      mimeType: "text/plain",
    });

    return parseOcrText(String(text || ""));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { nome: null, genitora: null, nascimento: null, vulgo: null, cpf: null, observacoes: null, _erro: msg };
  } finally {
    // 5. Limpeza (best-effort — não bloqueia a resposta)
    if (docId)      await drive.files.delete({ fileId: docId }).catch(() => {});
    if (uploadedId) await drive.files.delete({ fileId: uploadedId }).catch(() => {});
  }
}
