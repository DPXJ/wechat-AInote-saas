import { NextResponse } from "next/server";
import { getKnowledgeRecord, restoreRecord } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getKnowledgeRecord(id);
  if (!existing) {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }

  restoreRecord(id);
  return NextResponse.json({ ok: true });
}
