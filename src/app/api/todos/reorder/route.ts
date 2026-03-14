import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "缺少 orderedIds" }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(`UPDATE todos SET sort_order = ? WHERE id = ?`);
    const updateAll = db.transaction(() => {
      for (let i = 0; i < orderedIds.length; i++) {
        stmt.run(i, orderedIds[i]);
      }
    });
    updateAll();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "排序失败" },
      { status: 500 },
    );
  }
}
