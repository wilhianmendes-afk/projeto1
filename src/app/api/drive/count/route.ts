import { NextResponse } from "next/server";
import { countBQDriveFiles, hasBQDriveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

const CACHE_TTL = 5 * 60; // 5 minutos

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid_grant|token.*expired|token.*revoked|unauthorized/i.test(msg);
}

export async function GET() {
  if (!hasBQDriveConfig() || !process.env.DRIVE_BQ_FOLDER_ID) {
    return NextResponse.json({ count: 0, error: "no_config" });
  }
  try {
    const count = await countBQDriveFiles(process.env.DRIVE_BQ_FOLDER_ID!);
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 2}` } }
    );
  } catch (err) {
    console.error("[drive/count]", err);
    const error = isAuthError(err) ? "auth_expired" : "fetch_error";
    return NextResponse.json({ count: 0, error }, { status: 200 });
  }
}
