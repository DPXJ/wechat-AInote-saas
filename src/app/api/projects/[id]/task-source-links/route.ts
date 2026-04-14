import { NextResponse } from "next/server";
import { getProject, listTaskSourceLinksByProject } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const project = await getProject(userId, id);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const linksByTaskId = await listTaskSourceLinksByProject(userId, id);
    return NextResponse.json({ linksByTaskId });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
