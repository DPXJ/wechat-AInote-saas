import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

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
