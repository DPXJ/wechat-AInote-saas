import { NextResponse } from "next/server";
import { createFlashMemo, resolveUserIdByIngestToken } from "@/lib/flash-memos";
import type { FlashMemoSource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBearer(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const alt = request.headers.get("x-flash-memo-token");
  return (alt || "").trim();
}

export async function POST(request: Request) {
  const token = extractBearer(request);
  if (!token) {
    return NextResponse.json(
      { error: "缺少凭证：请使用 Authorization: Bearer <令牌>，或请求头 X-Flash-Memo-Token。" },
      { status: 401 },
    );
  }

  const userId = await resolveUserIdByIngestToken(token);
  if (!userId) {
    return NextResponse.json({ error: "无效令牌。" }, { status: 401 });
  }

  let body: { content?: unknown; source?: unknown; externalId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON。" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "content 不能为空。" }, { status: 400 });
  }

  const rawSource = String(body.source ?? "api").toLowerCase();
  const source: FlashMemoSource =
    rawSource === "flomo" ? "flomo" : rawSource === "web" ? "web" : "api";

  const externalId = body.externalId != null ? String(body.externalId).trim() || null : null;

  try {
    const memo = await createFlashMemo(userId, { content, source, externalId });
    if (!memo) {
      return NextResponse.json({ error: "写入失败。" }, { status: 500 });
    }
    return NextResponse.json({ memo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败。";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
