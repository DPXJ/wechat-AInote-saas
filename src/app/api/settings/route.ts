import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server";
import { getIntegrationSettings, saveIntegrationSettings } from "@/lib/settings";

export const runtime = "nodejs";

const settingsSchema = z.object({
  aiProvider: z.enum(["openai", "glm", "deepseek", ""]).optional().default(""),
  aiApiKey: z.string().optional().default(""),
  aiSummaryPrompt: z.string().optional().default(""),
  aiTodoPrompt: z.string().optional().default(""),
  storageMode: z.enum(["local", "oss"]),
  notionToken: z.string(),
  notionParentPageId: z.string(),
  smtpHost: z.string(),
  smtpPort: z.string(),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  smtpFrom: z.string(),
  tickTickInboxEmail: z.string(),
  ossRegion: z.string(),
  ossBucket: z.string(),
  ossEndpoint: z.string(),
  ossAccessKeyId: z.string(),
  ossAccessKeySecret: z.string(),
  ossPathPrefix: z.string(),
  ossPublicBaseUrl: z.string(),
  visionModelBaseUrl: z.string().optional().default(""),
  visionModelApiKey: z.string().optional().default(""),
  visionModelName: z.string().optional().default(""),
  ocrEnabled: z.boolean().optional().default(false),
  imapHost: z.string().optional().default(""),
  imapPort: z.string().optional().default("993"),
  imapUser: z.string().optional().default(""),
  imapPass: z.string().optional().default(""),
  imapSecure: z.boolean().optional().default(true),
  flomoWebhookUrl: z.string().optional().default(""),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ settings: await getIntegrationSettings(userId) });
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

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体解析失败，请重试。" }, { status: 400 });
    }

    const body = settingsSchema.safeParse(raw);

    if (!body.success) {
      const details = body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ error: `配置校验失败: ${details}` }, { status: 400 });
    }

    const settings = await saveIntegrationSettings(userId, body.data);
    return NextResponse.json({ settings });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: `保存失败: ${msg}` }, { status: 500 });
  }
}
