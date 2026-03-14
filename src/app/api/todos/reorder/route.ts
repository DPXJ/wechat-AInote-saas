import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "缺少 orderedIds" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const updates = orderedIds.map((id, i) =>
      supabase
        .from("todos")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("user_id", userId),
    );
    await Promise.all(updates);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "排序失败" },
      { status: 500 },
    );
  }
}
