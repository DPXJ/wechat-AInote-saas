import { NextResponse } from "next/server";
import { requireUserIdFromRequest } from "@/lib/supabase/server";
import { removeFavorite } from "@/lib/favorites";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const userId = await requireUserIdFromRequest(request);
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
