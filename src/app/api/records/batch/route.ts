import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { deleteKnowledgeRecord, hardDeleteRecord, getKnowledgeRecord } from "@/lib/records";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids, tags } = body as {
      action: "delete" | "hardDelete" | "addTags" | "restore";
      ids: string[];
      tags?: string[];
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少 ids 参数" }, { status: 400 });
    }

    const db = getDb();
    let affected = 0;

    switch (action) {
      case "delete":
        for (const id of ids) {
          await deleteKnowledgeRecord(id);
          affected++;
        }
        break;

      case "hardDelete":
        for (const id of ids) {
          await hardDeleteRecord(id);
          affected++;
        }
        break;

      case "restore":
        for (const id of ids) {
          db.prepare(`UPDATE records SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(nowIso(), id);
          affected++;
        }
        break;

      case "addTags":
        if (!tags || tags.length === 0) {
          return NextResponse.json({ error: "缺少 tags 参数" }, { status: 400 });
        }
        for (const id of ids) {
          const record = getKnowledgeRecord(id);
          if (!record) continue;
          const existing = record.keywords || [];
          const merged = [...existing, ...tags.filter((t) => !existing.includes(t))];
          db.prepare(`UPDATE records SET keywords = ?, updated_at = ? WHERE id = ?`).run(
            JSON.stringify(merged),
            nowIso(),
            id,
          );
          affected++;
        }
        break;

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, affected });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量操作失败" },
      { status: 500 },
    );
  }
}
