import { NextResponse } from "next/server";
import { getProject, unlinkTaskSourceRecord } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string; recordId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id, taskId, recordId } = await params;
    const project = await getProject(userId, id);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    await unlinkTaskSourceRecord(userId, id, taskId, recordId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "取消关联失败";
    return NextResponse.json({ error: msg }, { status: msg.includes("不存在") ? 404 : 500 });
  }
}
