import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";



export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "week";

    const now = new Date();
    let startDate: Date;
    if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
    }
    const startIso = startDate.toISOString();

    const supabase = getSupabaseAdmin();

    const [newRecordsRes, typeDistRes, completedTodosRes, pendingTodosRes, activeDaysRes, keywordsRes] =
      await Promise.all([
        supabase
          .from("records")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .is("deleted_at", null),
        supabase
          .from("records")
          .select("record_type")
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .is("deleted_at", null),
        supabase
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .not("completed_at", "is", null)
          .gte("completed_at", startIso),
        supabase
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "pending"),
        supabase
          .from("records")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .is("deleted_at", null),
        supabase
          .from("records")
          .select("keywords")
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .is("deleted_at", null),
      ]);

    const newRecords = newRecordsRes.count ?? 0;
    const completedTodos = completedTodosRes.count ?? 0;
    const pendingTodos = pendingTodosRes.count ?? 0;

    const typeCountMap = new Map<string, number>();
    for (const r of typeDistRes.data ?? []) {
      const t = r.record_type;
      typeCountMap.set(t, (typeCountMap.get(t) || 0) + 1);
    }
    const typeDist = Array.from(typeCountMap.entries())
      .map(([record_type, cnt]) => ({ record_type, cnt }))
      .sort((a, b) => b.cnt - a.cnt);

    const activeDaysSet = new Set<string>();
    for (const r of activeDaysRes.data ?? []) {
      activeDaysSet.add(r.created_at.slice(0, 10));
    }

    const keywordCount = new Map<string, number>();
    for (const r of keywordsRes.data ?? []) {
      const kws: string[] = r.keywords || [];
      for (const k of kws) {
        const key = k.trim();
        if (key) keywordCount.set(key, (keywordCount.get(key) || 0) + 1);
      }
    }
    const topKeywords = Array.from(keywordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    return NextResponse.json({
      period,
      startDate: startIso,
      newRecords,
      typeDist,
      completedTodos,
      pendingTodos,
      activeDays: activeDaysSet.size,
      topKeywords,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
