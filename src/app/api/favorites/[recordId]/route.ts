import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { removeFavorite } from "@/lib/favorites";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { recordId } = await params;
    await removeFavorite(userId, recordId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
