import { NextResponse } from "next/server";
import { fetchNewEmails } from "@/lib/email-inbox";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await fetchNewEmails(20);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { fetched: 0, errors: [err instanceof Error ? err.message : "未知错误"] },
      { status: 500 },
    );
  }
}
