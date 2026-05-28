import { NextResponse } from "next/server";
import { countBQDriveFiles, hasBQDriveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

const CACHE_TTL = 5 * 60; // 5 minutos

export async function GET() {
  if (!hasBQDriveConfig() || !process.env.DRIVE_BQ_FOLDER_ID) {
    return NextResponse.json({ count: 0 });
  }
  try {
    const count = await countBQDriveFiles(process.env.DRIVE_BQ_FOLDER_ID);
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 2}` } }
    );
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
