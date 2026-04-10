import { NextResponse } from "next/server";
import { createProjectTask, getProject, listProjectTasks } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";
import type { TodoPriority } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: projectId } = await params;
    const project = await getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const tasks = await listProjectTasks(userId, projectId);
    return NextResponse.json({ tasks });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: projectId } = await params;
    const body = (await request.json()) as {
      content?: string;
      priority?: TodoPriority;
      dueAt?: string | null;
    };
    const content = (body.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "请填写任务内容" }, { status: 400 });
    }
    const task = await createProjectTask(userId, projectId, {
      content,
      priority: body.priority,
      dueAt: body.dueAt,
    });
    if (!task) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "创建失败";
    console.error("[project-tasks] POST", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
