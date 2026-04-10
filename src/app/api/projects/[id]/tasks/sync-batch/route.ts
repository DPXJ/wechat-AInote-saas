import { NextResponse } from "next/server";
import {
  getProject,
  listProjectTasks,
  syncProjectTaskToTickTick,
} from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 批量将项目中未完成任务投递滴答（可选传 task id 子集） */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: projectId } = await params;
    const project = await getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    let body: { ids?: string[] } = {};
    try {
      body = (await request.json()) as { ids?: string[] };
    } catch {
      body = {};
    }
    let tasks = await listProjectTasks(userId, projectId);
    tasks = tasks.filter((t) => t.status === "pending" && t.content.trim());
    if (body.ids?.length) {
      const set = new Set(body.ids);
      tasks = tasks.filter((t) => set.has(t.id));
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const t of tasks) {
      const r = await syncProjectTaskToTickTick(userId, t.id);
      if (r.ok) synced++;
      else {
        failed++;
        if (errors.length < 3) errors.push(r.error);
      }
    }

    return NextResponse.json({ synced, failed, errors });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "批量同步失败" }, { status: 500 });
  }
}
