import { NextResponse } from "next/server";
import { getKnowledgeRecord, restoreRecord } from "@/lib/records";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getKnowledgeRecord(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
    }

    await restoreRecord(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
