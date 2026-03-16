import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { syncTodoToTickTick } from "@/lib/todo-sync";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await syncTodoToTickTick(userId, id);

    if (!result.ok) {
      if (result.error === "待办不存在。") {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      if (result.error.includes("SMTP") || result.error.includes("滴答清单")) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(result.error)) {
        return NextResponse.json({ error: "SMTP 连接失败，请检查网络和邮箱配置" }, { status: 500 });
      }
      if (/Invalid login|auth|535|Authentication failed/i.test(result.error)) {
        return NextResponse.json({ error: "邮箱登录失败，请检查 SMTP 账号和授权码" }, { status: 500 });
      }
      return NextResponse.json({ error: `同步失败：${result.error}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, todo: result.todo, message: "已同步到滴答清单。" });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录，请刷新页面重试" }, { status: 401 });
    }
    throw e;
  }
}
