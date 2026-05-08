import { NextResponse } from "next/server";

export const maxDuration = 30;

// Tests the exact same pipeline as the backfill, with a known skipped record
export async function GET() {
  const faceUrl = process.env.FACE_SERVICE_URL ?? "(not set)";
  const testImageUrl =
    "https://avtbwrkjqaepbawvxyvf.supabase.co/storage/v1/object/public/faces/ibis/8790c0b7-b4ac-4317-8cca-c348d73b8481.jpg.jpg";

  const log: Record<string, unknown> = { faceUrl, testImageUrl };

  // Step 1: download image exactly as backfill does
  let buffer: Buffer;
  try {
    const imgRes = await fetch(testImageUrl, { signal: AbortSignal.timeout(15000) });
    log.imageStatus = imgRes.status;
    log.imageOk = imgRes.ok;
    if (!imgRes.ok) throw new Error("HTTP " + imgRes.status);
    const arr = await imgRes.arrayBuffer();
    buffer = Buffer.from(arr);
    log.bufferSize = buffer.length;
  } catch (e) {
    log.imageError = String(e);
    return NextResponse.json(log);
  }

  // Step 2: call face service with embed-raw exactly as embedImage does
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
    log.embedBodyPreview = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      log.count = parsed.count;
      log.total_detected = parsed.total_detected;
      log.image_size = parsed.image_size;
      log.elapsed_ms = parsed.elapsed_ms;
    } catch {
      log.parseError = "response is not JSON";
    }
  } catch (e) {
    log.embedError = String(e);
  }

  return NextResponse.json(log);
}
