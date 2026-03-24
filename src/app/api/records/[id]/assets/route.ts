import { NextResponse } from "next/server";
import { appendAssetsToRecord } from "@/lib/records";
import { requireUserId } from "@/lib/supabase/server";
import type { StoredUpload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id: recordId } = await params;
    const formData = await request.formData();
    const fileEntries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "请至少选择一个文件。" }, { status: 400 });
    }

    const enableOcr = String(formData.get("enableOcr") || "true") !== "false";

    const uploads: StoredUpload[] = await Promise.all(
      fileEntries.map(async (file) => ({
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const fileMeta = fileEntries.map((_, i) => {
      const tagsRaw = String(formData.get(`fileTags_${i}`) || "");
      const desc = String(formData.get(`fileDesc_${i}`) || "");
      const tags = tagsRaw
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
      return { tags, description: desc };
    });

    const record = await appendAssetsToRecord(userId, recordId, uploads, fileMeta, { enableOcr });
    if (!record) {
      return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
    }

    return NextResponse.json({ record }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
