import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server";
import {
  getIntegrationStatus,
  sendTickTickTestEmail,
  testNotionConnection,
  testOssConnection,
  testSmtpConnection,
} from "@/lib/sync";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["notion", "smtp", "ticktick-email", "oss"]),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ status: await getIntegrationStatus(userId) });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json({ error: "无效的连接测试目标。" }, { status: 400 });
    }

    const result =
      body.data.target === "notion"
        ? await testNotionConnection(userId)
        : body.data.target === "smtp"
          ? await testSmtpConnection(userId)
          : body.data.target === "oss"
            ? await testOssConnection(userId)
            : await sendTickTickTestEmail(userId);

    return NextResponse.json({
      ...result,
      status: await getIntegrationStatus(userId),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "连接测试失败。" },
      { status: 400 },
    );
  }
}
