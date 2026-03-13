import { NextResponse } from "next/server";
import {
  deleteKnowledgeRecord,
  getKnowledgeRecord,
  updateKnowledgeRecord,
} from "@/lib/records";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getKnowledgeRecord(id);
  if (!existing) {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    contextNote?: string;
    sourceLabel?: string;
  };

  const record = updateKnowledgeRecord(id, body);
  return NextResponse.json({ record });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getKnowledgeRecord(id);
  if (!existing) {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }

  await deleteKnowledgeRecord(id);
  return NextResponse.json({ ok: true });
}
