import { NextResponse } from "next/server";
import { z } from "zod";
import { syncRecord } from "@/lib/sync";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["notion", "ticktick-email", "feishu-doc", "flomo"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = bodySchema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json({ error: "无效的同步目标。" }, { status: 400 });
    }

    const result = await syncRecord(userId, id, body.data.target);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "同步失败" },
      { status: 400 },
    );
  }
}
