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
});

export async function GET() {
  return NextResponse.json({ settings: getIntegrationSettings() });
}

export async function POST(request: Request) {
  const body = settingsSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const settings = saveIntegrationSettings(body.data);
  return NextResponse.json({ settings });
}
