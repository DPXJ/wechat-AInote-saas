import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { fetchNewEmails } from "@/lib/email-inbox";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await fetchNewEmails(userId, 20);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { fetched: 0, errors: [e instanceof Error ? e.message : "未知错误"] },
      { status: 500 },
    );
  }
}
