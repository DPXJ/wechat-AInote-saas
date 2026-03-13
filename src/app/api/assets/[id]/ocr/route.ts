import { NextResponse } from "next/server";
import { ocrImage } from "@/lib/ocr";
import { getAssetById, readAssetBuffer, updateAssetOcr } from "@/lib/records";

export const runtime = "nodejs";

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
  if (!result || result.content.kind !== "buffer") {
    return NextResponse.json({ error: "无法读取附件内容。" }, { status: 500 });
  }

  const ocrResult = await ocrImage(result.content.buffer, asset.mime_type);
  if (!ocrResult) {
    return NextResponse.json(
      { error: "OCR 未启用或配置不完整，请在设置中配置 Vision 模型。" },
      { status: 400 },
    );
  }

  updateAssetOcr(id, ocrResult.text, ocrResult.keywords, ocrResult.description);

  return NextResponse.json({
    text: ocrResult.text,
    keywords: ocrResult.keywords,
    description: ocrResult.description,
  });
}
