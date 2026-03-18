import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { OcrError, ocrImage } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 对上传的图片进行 OCR 识别，用于记录表单预览 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "请上传图片文件。" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片类型。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ocrResult = await ocrImage(userId, buffer, file.type, true);
    return NextResponse.json({
      text: ocrResult.text,
      keywords: ocrResult.keywords,
      description: ocrResult.description,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const message = e instanceof OcrError ? e.message : "OCR 识别失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
