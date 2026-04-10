import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const projects = await listProjects(userId);
    return NextResponse.json({ projects });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "加载失败";
    console.error("[projects] GET", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { name?: string; description?: string };
    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "请填写项目名称" }, { status: 400 });
    }
    const project = await createProject(userId, { name, description: body.description });
    return NextResponse.json({ project });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "创建失败";
    console.error("[projects] POST", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
