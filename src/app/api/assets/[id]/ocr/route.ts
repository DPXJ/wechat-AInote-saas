import { NextResponse } from "next/server";
import { OcrError, ocrImage } from "@/lib/ocr";
import { getAssetById, readAssetBuffer, updateAssetOcr } from "@/lib/records";

export const runtime = "nodejs";

async function resolveBuffer(
  result: NonNullable<Awaited<ReturnType<typeof readAssetBuffer>>>,
): Promise<Buffer | null> {
  if (result.content.kind === "buffer") {
    return result.content.buffer;
  }
  if (result.content.kind === "redirect") {
    const res = await fetch(result.content.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = getAssetById(id);
  if (!asset) {
    return NextResponse.json({ error: "附件不存在。" }, { status: 404 });
  }

  if (!asset.mime_type.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片类型附件。" }, { status: 400 });
  }

  const result = await readAssetBuffer(id);
  if (!result) {
    return NextResponse.json({ error: "无法读取附件内容。" }, { status: 500 });
  }

  const buffer = await resolveBuffer(result);
  if (!buffer) {
    return NextResponse.json({ error: "无法读取附件内容。" }, { status: 500 });
  }

  try {
    const ocrResult = await ocrImage(buffer, asset.mime_type);
    updateAssetOcr(id, ocrResult.text, ocrResult.keywords, ocrResult.description);
    return NextResponse.json({
      text: ocrResult.text,
      keywords: ocrResult.keywords,
      description: ocrResult.description,
    });
  } catch (err) {
    const message = err instanceof OcrError ? err.message : "OCR 识别失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
