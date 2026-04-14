import { NextResponse } from "next/server";
import { getKnowledgeRecord } from "@/lib/records";
import { listRecordTaskProjectLinks } from "@/lib/projects";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
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
    const links = await listRecordTaskProjectLinks(userId, id);
    return NextResponse.json({ links });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
