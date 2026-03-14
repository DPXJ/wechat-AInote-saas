import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();

  const records = db
    .prepare(`SELECT id, keywords FROM records WHERE deleted_at IS NULL AND keywords != '[]'`)
    .all() as Array<{ id: string; keywords: string }>;

  const assets = db
    .prepare(`SELECT id, tags FROM assets WHERE tags != '[]'`)
    .all() as Array<{ id: string; tags: string }>;

  const tagCount = new Map<string, number>();

  for (const r of records) {
    const kws: string[] = safeJsonParse(r.keywords, []);
    for (const k of kws) {
      const key = k.trim().toLowerCase();
      if (key) tagCount.set(key, (tagCount.get(key) || 0) + 1);
    }
  }

  for (const a of assets) {
    const tags: string[] = safeJsonParse(a.tags, []);
    for (const t of tags) {
      const key = t.trim().toLowerCase();
      if (key) tagCount.set(key, (tagCount.get(key) || 0) + 1);
    }
  }

  const result = Array.from(tagCount.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ tags: result, total: result.length });
}

export async function DELETE(request: NextRequest) {
  const { tag } = await request.json();
  if (!tag || typeof tag !== "string") {
    return NextResponse.json({ error: "缺少 tag 参数" }, { status: 400 });
  }

  const db = getDb();
  const targetLower = tag.trim().toLowerCase();

  const records = db
    .prepare(`SELECT id, keywords FROM records WHERE keywords LIKE ?`)
    .all(`%${tag}%`) as Array<{ id: string; keywords: string }>;

  for (const r of records) {
    const kws: string[] = safeJsonParse(r.keywords, []);
    const filtered = kws.filter((k) => k.trim().toLowerCase() !== targetLower);
    db.prepare(`UPDATE records SET keywords = ? WHERE id = ?`).run(JSON.stringify(filtered), r.id);
  }

  const assets = db
    .prepare(`SELECT id, tags FROM assets WHERE tags LIKE ?`)
    .all(`%${tag}%`) as Array<{ id: string; tags: string }>;

  for (const a of assets) {
    const tags: string[] = safeJsonParse(a.tags, []);
    const filtered = tags.filter((t) => t.trim().toLowerCase() !== targetLower);
    db.prepare(`UPDATE assets SET tags = ? WHERE id = ?`).run(JSON.stringify(filtered), a.id);
  }

  return NextResponse.json({ ok: true, removed: records.length + assets.length });
}
