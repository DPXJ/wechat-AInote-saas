import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server";
import { testFlomoWebhook } from "@/lib/flomo";
import {
  getIntegrationStatus,
  sendTickTickTestEmail,
  testNotionConnection,
  testSmtpConnection,
} from "@/lib/sync";
import { isAiConfiguredFromSettings } from "@/lib/ai";
import { getIntegrationSettings } from "@/lib/settings";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["notion", "smtp", "ticktick-email", "flomo"]),
  webhookUrl: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const status = await getIntegrationStatus(userId);
    const settings = await getIntegrationSettings(userId);
    return NextResponse.json({
      status,
      aiConfigured: isAiConfiguredFromSettings(settings),
    });
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

    let result: { ok: boolean; message: string };
    if (body.data.target === "flomo") {
      const url = body.data.webhookUrl?.trim() || (await getIntegrationSettings(userId)).flomoWebhookUrl || "";
      result = await testFlomoWebhook(url);
    } else {
      result =
        body.data.target === "notion"
          ? await testNotionConnection(userId)
          : body.data.target === "smtp"
            ? await testSmtpConnection(userId)
            : await sendTickTickTestEmail(userId);
    }

    const status = await getIntegrationStatus(userId);
    const settings = await getIntegrationSettings(userId);
    return NextResponse.json({
      ...result,
      status,
      aiConfigured: isAiConfiguredFromSettings(settings),
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
