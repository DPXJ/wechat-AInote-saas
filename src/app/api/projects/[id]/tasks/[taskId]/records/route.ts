import { NextResponse } from "next/server";
import { getProject, linkTaskToSourceRecord, setTaskSourceRecords } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id, taskId } = await params;
    const body = (await request.json()) as { recordIds?: string[] };
    const recordIds = Array.isArray(body.recordIds) ? body.recordIds : [];
    const project = await getProject(userId, id);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const links = await setTaskSourceRecords(userId, id, taskId, recordIds);
    return NextResponse.json({ links });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "保存失败";
    if (msg.includes("项目不存在") || msg.includes("任务不存在")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    const status =
      msg.includes("不存在") || msg.includes("回收站") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id, taskId } = await params;
    const body = (await request.json()) as { recordId?: string };
    const recordId = String(body.recordId || "").trim();
    if (!recordId) {
      return NextResponse.json({ error: "请提供 recordId。" }, { status: 400 });
    }
    const project = await getProject(userId, id);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const link = await linkTaskToSourceRecord(userId, id, taskId, recordId);
    return NextResponse.json({ link });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "关联失败";
    if (msg.includes("项目不存在") || msg.includes("任务不存在")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    const status =
      msg.includes("不存在") || msg.includes("确认为信源") || msg.includes("已关联")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
