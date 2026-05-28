import { NextResponse } from "next/server";
import { countBQDriveFiles, hasBQDriveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasBQDriveConfig() || !process.env.DRIVE_BQ_FOLDER_ID) {
    return NextResponse.json({ count: 0 });
  }
  try {
    const count = await countBQDriveFiles(process.env.DRIVE_BQ_FOLDER_ID);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
