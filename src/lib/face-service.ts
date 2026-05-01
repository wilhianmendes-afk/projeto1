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

export async function embedImage(imageBuffer: Buffer, filename = "photo.jpg"): Promise<EmbedResponse> {
  const form = new FormData();
  form.append("file", new Blob([imageBuffer]), filename);

  const res = await fetch(`${FACE_SERVICE_URL}/embed`, {
    method: "POST",
    headers: FACE_SERVICE_TOKEN ? { Authorization: `Bearer ${FACE_SERVICE_TOKEN}` } : {},
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`face-service error ${res.status}: ${text}`);
  }

  return res.json() as Promise<EmbedResponse>;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
