import { NextResponse } from "next/server";
import { z } from "zod";
import { syncRecord } from "@/lib/sync";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["notion", "ticktick-email", "feishu-doc"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = bodySchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "无效的同步目标。" }, { status: 400 });
  }

  try {
    const result = await syncRecord(id, body.data.target);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 400 },
    );
  }
}
