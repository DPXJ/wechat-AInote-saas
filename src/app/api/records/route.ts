import { NextResponse } from "next/server";
import { createKnowledgeRecord, listKnowledgeRecords } from "@/lib/records";
import type { StoredUpload } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ records: listKnowledgeRecords() });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const title = String(formData.get("title") || "");
  const sourceLabel = String(formData.get("sourceLabel") || "");
  const contextNote = String(formData.get("contextNote") || "");
  const contentText = String(formData.get("contentText") || "");
  const fileEntries = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!contentText.trim() && fileEntries.length === 0) {
    return NextResponse.json(
      { error: "至少提供一段文本，或上传一个附件。" },
      { status: 400 },
    );
  }

  const uploads: StoredUpload[] = await Promise.all(
    fileEntries.map(async (file) => ({
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const record = await createKnowledgeRecord(
    {
      title,
      sourceLabel,
      contextNote,
      contentText,
    },
    uploads,
  );

  return NextResponse.json({ record });
}
