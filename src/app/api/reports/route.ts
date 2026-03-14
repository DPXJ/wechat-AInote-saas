import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  const db = getDb();

  const { newRecords } = db
    .prepare(`SELECT count(*) as newRecords FROM records WHERE created_at >= ? AND deleted_at IS NULL`)
    .get(startIso) as { newRecords: number };

  const typeDist = db
    .prepare(`SELECT record_type, count(*) as cnt FROM records WHERE created_at >= ? AND deleted_at IS NULL GROUP BY record_type ORDER BY cnt DESC`)
    .all(startIso) as Array<{ record_type: string; cnt: number }>;

  const { completedTodos } = db
    .prepare(`SELECT count(*) as completedTodos FROM todos WHERE completed_at IS NOT NULL AND completed_at >= ?`)
    .get(startIso) as { completedTodos: number };

  const { pendingTodos } = db
    .prepare(`SELECT count(*) as pendingTodos FROM todos WHERE status = 'pending'`)
    .get() as { pendingTodos: number };

  const activeDaysRows = db
    .prepare(`SELECT DISTINCT date(created_at) as d FROM records WHERE created_at >= ? AND deleted_at IS NULL`)
    .all(startIso) as Array<{ d: string }>;

  const allRecords = db
    .prepare(`SELECT keywords FROM records WHERE created_at >= ? AND deleted_at IS NULL AND keywords != '[]'`)
    .all(startIso) as Array<{ keywords: string }>;

  const keywordCount = new Map<string, number>();
  for (const r of allRecords) {
    const kws: string[] = safeJsonParse(r.keywords, []);
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
    activeDays: activeDaysRows.length,
    topKeywords,
  });
}
