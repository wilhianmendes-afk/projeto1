import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ files: [] }, { status: 401 });

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ files: [] });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ files: [] });

  const safeQ = q.replace(/'/g, "\\'");
  const folderId = process.env.DRIVE_ABORDADOS_FOLDER_ID;
  const folderFilter = folderId ? ` and '${folderId}' in parents` : "";

  try {
    const drive = getDriveClient();
    const { data } = await drive.files.list({
      q: `fullText contains '${safeQ}' and mimeType contains 'image/' and trashed = false${folderFilter}`,
      fields: "files(id, name, thumbnailLink)",
      pageSize: 20,
      orderBy: "relevance",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = (data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "Sem nome",
      thumbnailLink: f.thumbnailLink ?? null,
    }));

    return NextResponse.json({ files });
  } catch (err) {
    console.error("[drive/own-search]", err);
    return NextResponse.json({ files: [] });
  }
}
