import { NextResponse } from "next/server";
import { isAiConfiguredFromSettings } from "@/lib/ai";
import { getIntegrationSettings } from "@/lib/settings";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await getIntegrationSettings(userId);
    return NextResponse.json({ configured: isAiConfiguredFromSettings(settings) });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
