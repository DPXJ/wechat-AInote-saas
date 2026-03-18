import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** 按最近使用顺序返回标签：从最近更新的记录及其附件中收集标签，去重后取前 limit 个 */
async function getRecentTags(userId: string, limit: number): Promise<Array<{ tag: string; count: number }>> {
  const supabase = getSupabaseAdmin();
  const { data: records } = await supabase
    .from("records")
    .select("id, keywords, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!records?.length) return [];

  const recordIds = records.map((r) => r.id);
  const recordOrder = new Map(records.map((r, i) => [r.id, i]));
  const { data: assets } = await supabase
    .from("assets")
    .select("record_id, tags")
    .eq("user_id", userId)
    .in("record_id", recordIds);

  const tagsByRecord = new Map<string, string[]>();
  for (const r of records) {
    const kws = (r.keywords || []).map((k) => k.trim()).filter(Boolean);
    tagsByRecord.set(r.id, [...kws]);
  }
  for (const a of assets ?? []) {
    const existing = tagsByRecord.get(a.record_id) ?? [];
    const more = (a.tags || []).map((t) => t.trim()).filter(Boolean);
    tagsByRecord.set(a.record_id, [...existing, ...more]);
  }

  const seen = new Set<string>();
  const recent: string[] = [];
  for (const r of records) {
    for (const t of tagsByRecord.get(r.id) ?? []) {
      const key = t.toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        recent.push(t);
        if (recent.length >= limit) break;
      }
    }
    if (recent.length >= limit) break;
  }
  return recent.map((tag) => ({ tag, count: 0 }));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const recentLimit = searchParams.get("recent");
    const wantRecent = recentLimit != null && /^\d+$/.test(recentLimit);
    const limit = wantRecent ? Math.min(parseInt(recentLimit, 10), 20) : 0;

    if (wantRecent && limit > 0) {
      const tags = await getRecentTags(userId, limit);
      return NextResponse.json({ tags, total: tags.length });
    }

    const { data: records } = await supabase
      .from("records")
      .select("id, keywords")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const { data: assets } = await supabase
      .from("assets")
      .select("id, tags")
      .eq("user_id", userId);

    const tagCount = new Map<string, number>();

    for (const r of records ?? []) {
      const kws: string[] = r.keywords || [];
      for (const k of kws) {
        const key = k.trim().toLowerCase();
        if (key) tagCount.set(key, (tagCount.get(key) || 0) + 1);
      }
    }

    for (const a of assets ?? []) {
      const tags: string[] = a.tags || [];
      for (const t of tags) {
        const key = t.trim().toLowerCase();
        if (key) tagCount.set(key, (tagCount.get(key) || 0) + 1);
      }
    }

    const result = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ tags: result, total: result.length });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { tag } = await request.json();
    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "缺少 tag 参数" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const targetLower = tag.trim().toLowerCase();
    let removedCount = 0;

    const { data: records } = await supabase
      .from("records")
      .select("id, keywords")
      .eq("user_id", userId);

    for (const r of records ?? []) {
      const kws: string[] = r.keywords || [];
      if (!kws.some((k) => k.trim().toLowerCase() === targetLower)) continue;
      const filtered = kws.filter((k) => k.trim().toLowerCase() !== targetLower);
      await supabase
        .from("records")
        .update({ keywords: filtered })
        .eq("id", r.id)
        .eq("user_id", userId);
      removedCount++;
    }

    const { data: assets } = await supabase
      .from("assets")
      .select("id, tags")
      .eq("user_id", userId);

    for (const a of assets ?? []) {
      const tags: string[] = a.tags || [];
      if (!tags.some((t) => t.trim().toLowerCase() === targetLower)) continue;
      const filtered = tags.filter((t) => t.trim().toLowerCase() !== targetLower);
      await supabase
        .from("assets")
        .update({ tags: filtered })
        .eq("id", a.id)
        .eq("user_id", userId);
      removedCount++;
    }

    return NextResponse.json({ ok: true, removed: removedCount });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
