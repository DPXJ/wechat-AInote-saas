import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { searchKnowledge } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const query = new URL(request.url).searchParams.get("q") || "";
    return NextResponse.json(await searchKnowledge(userId, query));
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
    const body = await request.json();
    const query = body.q || "";
    const history = body.history || [];
    return NextResponse.json(await searchKnowledge(userId, query, history));
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
