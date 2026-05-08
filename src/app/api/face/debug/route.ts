import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET() {
  const faceUrl = process.env.FACE_SERVICE_URL ?? "(not set)";
  const testImageUrl =
    "https://avtbwrkjqaepbawvxyvf.supabase.co/storage/v1/object/public/faces/ibis/8905-177904.jpg.jpg";

  const log: Record<string, unknown> = { faceUrl };

  // Step 1: download image
  let buffer: Buffer;
  try {
    const imgRes = await fetch(testImageUrl, { signal: AbortSignal.timeout(10000) });
    log.imageStatus = imgRes.status;
    log.imageOk = imgRes.ok;
    const arr = await imgRes.arrayBuffer();
    buffer = Buffer.from(arr);
    log.bufferSize = buffer.length;
  } catch (e) {
    log.imageError = String(e);
    return NextResponse.json(log);
  }

  // Step 2: call face service with raw binary (embed-raw)
  try {
    const embedRes = await fetch(`${faceUrl}/embed-raw`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(20000),
    });
    log.embedStatus = embedRes.status;
    log.embedOk = embedRes.ok;
    const body = await embedRes.text();
    log.embedBody = body.slice(0, 400);
    try {
      const parsed = JSON.parse(body);
      log.count = parsed.count;
      log.total_detected = parsed.total_detected;
      log.image_size = parsed.image_size;
    } catch {
      log.parseError = "not JSON";
    }
  } catch (e) {
    log.embedError = String(e);
  }

  return NextResponse.json(log);
}
