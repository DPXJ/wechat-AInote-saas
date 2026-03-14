import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ocrImage } from "@/lib/ocr";
import { readStoredUpload } from "@/lib/storage";
import { updateAssetOcr } from "@/lib/records";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT id, storage_key, mime_type, original_name FROM assets WHERE mime_type LIKE 'image/%' AND (ocr_text = '' OR ocr_text IS NULL)`,
    )
    .all() as Array<{
    id: string;
    storage_key: string;
    mime_type: string;
    original_name: string;
  }>;

  const total = pending.length;
  let success = 0;
  let failed = 0;
  const errors: Array<{ assetId: string; name: string; error: string }> = [];

  for (const asset of pending) {
    try {
      const result = await readStoredUpload(asset.storage_key);
      let buffer: Buffer;
      if (result.kind === "buffer") {
        buffer = result.buffer;
      } else {
        const resp = await fetch(result.url);
        buffer = Buffer.from(await resp.arrayBuffer());
      }

      const ocrResult = await ocrImage(buffer, asset.mime_type);
      updateAssetOcr(asset.id, ocrResult.text, ocrResult.keywords, ocrResult.description);
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
}

export async function GET() {
  const db = getDb();
  const { total } = db
    .prepare(`SELECT count(*) as total FROM assets WHERE mime_type LIKE 'image/%'`)
    .get() as { total: number };
  const { pending } = db
    .prepare(
      `SELECT count(*) as pending FROM assets WHERE mime_type LIKE 'image/%' AND (ocr_text = '' OR ocr_text IS NULL)`,
    )
    .get() as { pending: number };

  return NextResponse.json({ total, scanned: total - pending, pending });
}
