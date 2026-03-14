import { NextResponse, type NextRequest } from "next/server";
import { listDeletedRecords, cleanupOldDeletedRecords, hardDeleteRecord } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "50");
  const offset = Number(url.searchParams.get("offset") || "0");

  const result = listDeletedRecords({ limit, offset });
  return NextResponse.json(result);
}

export async function DELETE() {
  const expiredIds = cleanupOldDeletedRecords(30);
  for (const id of expiredIds) {
    await hardDeleteRecord(id);
  }
  return NextResponse.json({ cleaned: expiredIds.length });
}
