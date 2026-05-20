import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = params;
  if (!id) return new NextResponse(null, { status: 400 });

  try {
    const drive = getDriveClient();
    const res = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const contentType = (res.headers["content-type"] as string) ?? "image/jpeg";
    return new NextResponse(res.data as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[drive/photo]", err);
    return new NextResponse(null, { status: 404 });
  }
}
