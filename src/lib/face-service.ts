const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL!;
const FACE_SERVICE_TOKEN = process.env.FACE_SERVICE_TOKEN ?? "";

export interface FaceResult {
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number;
  embedding: number[];
}

export interface EmbedResponse {
  count: number;
  total_detected: number;
  elapsed_ms: number;
  image_size: { w: number; h: number };
  faces: FaceResult[];
}

export async function embedImage(imageBuffer: Buffer, filename = "photo.jpg", minScore?: number): Promise<EmbedResponse> {
  const url = minScore !== undefined
    ? `${FACE_SERVICE_URL}/embed-raw?min_score=${minScore}`
    : `${FACE_SERVICE_URL}/embed-raw`;

  const headers: Record<string, string> = { "Content-Type": "image/jpeg" };
  if (FACE_SERVICE_TOKEN) headers["Authorization"] = `Bearer ${FACE_SERVICE_TOKEN}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 5000));
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: new Uint8Array(imageBuffer),
      signal: AbortSignal.timeout(25000),
    });

    if (res.ok) return res.json() as Promise<EmbedResponse>;

    // Retry em 502/503: Railway acordando do sleep ou reiniciando após crash
    if ((res.status === 502 || res.status === 503) && attempt === 0) {
      console.warn(`[face-service] ${res.status} na tentativa 1, retentando em 5s...`);
      continue;
    }

    const text = await res.text();
    throw new Error(`face-service error ${res.status}: ${text}`);
  }

  throw new Error("face-service: falhou após 2 tentativas (502/503)");
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}
