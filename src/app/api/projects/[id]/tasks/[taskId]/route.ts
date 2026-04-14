import { NextResponse } from "next/server";
import {
  deleteProjectTask,
  getProject,
  updateProjectTask,
} from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";
import type { TodoPriority } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id: projectId, taskId } = await params;
    const project = await getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const body = (await request.json()) as {
      content?: string;
      status?: "pending" | "done";
      priority?: TodoPriority;
      dueAt?: string | null;
      sortOrder?: number;
      tags?: string[];
    };
    const task = await updateProjectTask(
      userId,
      taskId,
      {
        content: body.content,
        status: body.status,
        priority: body.priority,
        dueAt: body.dueAt,
        sortOrder: body.sortOrder,
        tags: body.tags,
      },
      projectId,
    );
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "更新失败";
    console.error("[project-task PATCH]", e);
    return NextResponse.json({ error: msg || "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
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
    await deleteProjectTask(userId, taskId, projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
