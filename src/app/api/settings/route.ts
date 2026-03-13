import { NextResponse } from "next/server";
import { z } from "zod";
import { getIntegrationSettings, saveIntegrationSettings } from "@/lib/settings";

export const runtime = "nodejs";

const settingsSchema = z.object({
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
});

export async function GET() {
  return NextResponse.json({ settings: getIntegrationSettings() });
}

export async function POST(request: Request) {
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

  try {
    const settings = saveIntegrationSettings(body.data);
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: `保存失败: ${msg}` }, { status: 500 });
  }
}
