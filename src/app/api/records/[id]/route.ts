import { NextResponse } from "next/server";
import { getKnowledgeRecord } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = getKnowledgeRecord(id);

  if (!record) {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }

  return NextResponse.json({ record });
}
