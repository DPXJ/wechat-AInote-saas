import { NextResponse } from "next/server";
import { addFavorite, listFavorites } from "@/lib/favorites";

export const runtime = "nodejs";

export async function GET() {
  const records = listFavorites();
  return NextResponse.json({ records, total: records.length });
}

export async function POST(request: Request) {
  const body = await request.json();
  const recordId = body.recordId;
  if (!recordId) {
    return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  }
  addFavorite(recordId);
  return NextResponse.json({ ok: true });
}
