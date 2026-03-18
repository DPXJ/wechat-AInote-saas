import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ocrImage } from "@/lib/ocr";
import { readStoredUpload } from "@/lib/storage";
import { updateAssetOcr } from "@/lib/records";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

    const { data: pending } = await supabase
      .from("assets")
      .select("id, storage_key, mime_type, original_name")
      .eq("user_id", userId)
      .ilike("mime_type", "image/%")
      .or("ocr_text.eq.,ocr_text.is.null");

    const items = pending ?? [];
    const total = items.length;
    let success = 0;
    let failed = 0;
    const errors: Array<{ assetId: string; name: string; error: string }> = [];

    for (const asset of items) {
      try {
        const result = await readStoredUpload(asset.storage_key, undefined, userId);
        let buffer: Buffer;
        if (result.kind === "buffer") {
          buffer = result.buffer;
        } else {
          const resp = await fetch(result.url);
          buffer = Buffer.from(await resp.arrayBuffer());
        }

        const ocrResult = await ocrImage(userId, buffer, asset.mime_type, true);
        await updateAssetOcr(userId, asset.id, ocrResult.text, ocrResult.keywords, ocrResult.description);
        success++;
      } catch (err) {
        failed++;
        errors.push({
          assetId: asset.id,
          name: asset.original_name,
          error: err instanceof Error ? err.message : "未知错误",
        });
      }
    }

    return NextResponse.json({ total, success, failed, errors: errors.slice(0, 10) });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

    const { count: total } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("mime_type", "image/%");

    const { count: pendingCount } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("mime_type", "image/%")
      .or("ocr_text.eq.,ocr_text.is.null");

    const t = total ?? 0;
    const p = pendingCount ?? 0;

    return NextResponse.json({ total: t, scanned: t - p, pending: p });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
