import { NextResponse, type NextRequest } from "next/server";
import { deleteKnowledgeRecord, hardDeleteRecord, getKnowledgeRecord, restoreRecord } from "@/lib/records";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const { action, ids, tags } = body as {
      action: "delete" | "hardDelete" | "addTags" | "restore";
      ids: string[];
      tags?: string[];
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少 ids 参数" }, { status: 400 });
    }

    let affected = 0;

    switch (action) {
      case "delete":
        for (const id of ids) {
          await deleteKnowledgeRecord(userId, id);
          affected++;
        }
        break;

      case "hardDelete":
        for (const id of ids) {
          await hardDeleteRecord(userId, id);
          affected++;
        }
        break;

      case "restore":
        for (const id of ids) {
          await restoreRecord(userId, id);
          affected++;
        }
        break;

      case "addTags":
        if (!tags || tags.length === 0) {
          return NextResponse.json({ error: "缺少 tags 参数" }, { status: 400 });
        }
        for (const id of ids) {
          const record = await getKnowledgeRecord(userId, id);
          if (!record) continue;
          const existing = record.keywords || [];
          const merged = [...existing, ...tags.filter((t) => !existing.includes(t))];
          await getSupabaseAdmin()
            .from("records")
            .update({ keywords: merged, updated_at: nowIso() })
            .eq("id", id)
            .eq("user_id", userId);
          affected++;
        }
        break;

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, affected });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量操作失败" },
      { status: 500 },
    );
  }
}
