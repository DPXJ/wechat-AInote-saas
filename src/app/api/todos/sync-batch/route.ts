import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { syncTodoToTickTick } from "@/lib/todo-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "请提供待办 ID 列表。" }, { status: 400 });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let synced = 0;
    let failed = 0;

    for (const id of ids) {
      if (typeof id !== "string" || id.startsWith("local_todo_")) {
        results.push({ id: String(id), ok: false, error: "本地待办无法同步" });
        failed += 1;
        continue;
      }
      const result = await syncTodoToTickTick(userId, id);
      if (result.ok) {
        results.push({ id, ok: true });
        synced += 1;
      } else {
        results.push({ id, ok: false, error: result.error });
        failed += 1;
      }
    }

    return NextResponse.json({
      synced,
      failed,
      results,
      message: `已同步 ${synced} 条${failed > 0 ? `，失败 ${failed} 条` : ""}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录，请刷新页面重试" }, { status: 401 });
    }
    throw e;
  }
}
