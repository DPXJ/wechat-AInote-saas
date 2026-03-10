import { NextResponse } from "next/server";
import { z } from "zod";
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
  return NextResponse.json({ status: getIntegrationStatus() });
}

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "无效的连接测试目标。" }, { status: 400 });
  }

  try {
    const result =
      body.data.target === "notion"
        ? await testNotionConnection()
        : body.data.target === "smtp"
          ? await testSmtpConnection()
          : body.data.target === "oss"
            ? await testOssConnection()
            : await sendTickTickTestEmail();

    return NextResponse.json({
      ...result,
      status: getIntegrationStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "连接测试失败。",
        status: getIntegrationStatus(),
      },
      { status: 400 },
    );
  }
}
