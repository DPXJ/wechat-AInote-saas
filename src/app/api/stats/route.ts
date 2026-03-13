import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTodoStats } from "@/lib/todos";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const { totalRecords } = db
    .prepare(`SELECT count(*) as totalRecords FROM records`)
    .get() as { totalRecords: number };
  const { todayRecords } = db
    .prepare(`SELECT count(*) as todayRecords FROM records WHERE date(created_at) = ?`)
    .get(today) as { todayRecords: number };
  const { imageCount } = db
    .prepare(`SELECT count(*) as imageCount FROM records WHERE record_type = 'image'`)
    .get() as { imageCount: number };
  const { textCount } = db
    .prepare(`SELECT count(*) as textCount FROM records WHERE record_type = 'text'`)
    .get() as { textCount: number };
  const { videoCount } = db
    .prepare(`SELECT count(*) as videoCount FROM records WHERE record_type = 'video'`)
    .get() as { videoCount: number };
  const { documentCount } = db
    .prepare(`SELECT count(*) as documentCount FROM records WHERE record_type IN ('document', 'pdf')`)
    .get() as { documentCount: number };

  const todoStats = getTodoStats();

  return NextResponse.json({
    totalRecords,
    todayRecords,
    imageCount,
    textCount,
    videoCount,
    documentCount,
    ...todoStats,
  });
}
