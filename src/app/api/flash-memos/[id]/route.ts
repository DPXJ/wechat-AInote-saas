import { NextResponse } from "next/server";
import { getFlashMemo, softDeleteFlashMemo } from "@/lib/flash-memos";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getFlashMemo(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "闪念不存在。" }, { status: 404 });
    }
    await softDeleteFlashMemo(userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
