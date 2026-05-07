import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/face-service";

export async function GET() {
  try {
    const online = await healthCheck();
    return NextResponse.json({
      face_service_online: online,
      face_service_url: process.env.FACE_SERVICE_URL,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({
      face_service_online: false,
      error: String(e),
      face_service_url: process.env.FACE_SERVICE_URL,
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
