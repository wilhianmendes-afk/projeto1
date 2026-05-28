import { NextResponse } from "next/server";
import { countBQDriveFiles, hasBQDriveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

const CACHE_TTL = 5 * 60; // 5 minutos

export async function GET() {
  const hasCfg = hasBQDriveConfig();
  const hasFolderId = !!process.env.DRIVE_BQ_FOLDER_ID;
  if (!hasCfg || !hasFolderId) {
    return NextResponse.json({ count: 0, _debug: { hasCfg, hasFolderId } });
  }
  try {
    const count = await countBQDriveFiles(process.env.DRIVE_BQ_FOLDER_ID);
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 2}` } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ count: 0, _error: msg });
  }
}
