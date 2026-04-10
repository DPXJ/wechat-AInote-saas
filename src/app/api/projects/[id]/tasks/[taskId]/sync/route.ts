import { NextResponse } from "next/server";
import { getProject, syncProjectTaskToTickTick } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id: projectId, taskId } = await params;
    const project = await getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const result = await syncProjectTaskToTickTick(userId, taskId);
    if (!result.ok) {
      const isConfig =
        result.error.includes("SMTP") || result.error.includes("滴答");
      return NextResponse.json(
        { error: result.error },
        { status: isConfig ? 400 : 502 },
      );
    }
    if (result.task.projectId !== projectId) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, task: result.task, message: "已投递到滴答清单。" });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "同步失败" }, { status: 500 });
  }
}
