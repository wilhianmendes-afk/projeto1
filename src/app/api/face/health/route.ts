import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/face-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await healthCheck();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
