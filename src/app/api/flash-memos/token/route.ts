import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { setFlashMemoIngestToken } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 生成或轮换闪念 HTTP 接入令牌（保存到用户设置） */
export async function POST() {
  try {
    const userId = await requireUserId();
    const token = crypto.randomBytes(32).toString("hex");
    const settings = await setFlashMemoIngestToken(userId, token);
    return NextResponse.json({ token, settings });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
