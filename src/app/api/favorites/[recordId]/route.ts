import { NextResponse } from "next/server";
import { removeFavorite } from "@/lib/favorites";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const { recordId } = await params;
  removeFavorite(recordId);
  return NextResponse.json({ ok: true });
}
