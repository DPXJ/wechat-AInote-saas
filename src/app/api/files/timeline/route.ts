import { NextResponse } from "next/server";
import { listFileTimeline } from "@/lib/records";
import { requireUserIdFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserIdFromRequest(request);
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 80, 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const { files, total } = await listFileTimeline(userId, { limit, offset });
    return NextResponse.json(
      { files, total, limit, offset },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "读取文件时间线失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
