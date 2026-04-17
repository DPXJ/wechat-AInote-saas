import { NextResponse } from "next/server";
import { createFlashMemo, listFlashMemos } from "@/lib/flash-memos";
import { requireUserId } from "@/lib/supabase/server";
import type { FlashMemoSource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || undefined;
    const source = (url.searchParams.get("source") || undefined) as FlashMemoSource | undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const result = await listFlashMemos(userId, {
      q,
      source: source === "flomo" || source === "api" || source === "web" ? source : undefined,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, must-revalidate" },
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
    const body = (await request.json()) as {
      content?: string;
      source?: FlashMemoSource;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "内容不能为空。" }, { status: 400 });
    }

    const memo = await createFlashMemo(userId, {
      content: body.content.trim(),
      source: body.source ?? "web",
    });

    if (!memo) {
      return NextResponse.json({ error: "创建失败。" }, { status: 500 });
    }

    return NextResponse.json({ memo });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "创建失败。";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
