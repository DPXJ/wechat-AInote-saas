import { NextResponse } from "next/server";
import {
  deleteKnowledgeRecord,
  getKnowledgeRecord,
  updateKnowledgeRecord,
} from "@/lib/records";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const record = await getKnowledgeRecord(userId, id);

    if (!record) {
      return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
    }

    return NextResponse.json({ record });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getKnowledgeRecord(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
    }

    const body = (await request.json()) as {
      title?: string;
      contextNote?: string;
      sourceLabel?: string;
      contentText?: string;
    };

    const record = await updateKnowledgeRecord(userId, id, body);
    return NextResponse.json({ record });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(
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

    await deleteKnowledgeRecord(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
