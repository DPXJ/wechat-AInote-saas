import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { addFavorite, isFavorite, listFavorites } from "@/lib/favorites";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const recordId = url.searchParams.get("recordId");
    if (recordId) {
      const favorited = await isFavorite(userId, recordId);
      return NextResponse.json({ favorited });
    }
    const records = await listFavorites(userId);
    return NextResponse.json({ records, total: records.length });
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
    const recordId = body.recordId;
    if (!recordId) {
      return NextResponse.json({ error: "recordId is required" }, { status: 400 });
    }
    await addFavorite(userId, recordId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
