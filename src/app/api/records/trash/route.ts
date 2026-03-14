import { NextResponse, type NextRequest } from "next/server";
import { listDeletedRecords, cleanupOldDeletedRecords, hardDeleteRecord } from "@/lib/records";
import { requireUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "50");
    const offset = Number(url.searchParams.get("offset") || "0");

    const result = await listDeletedRecords(userId, { limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    const expiredIds = await cleanupOldDeletedRecords(userId, 30);
    for (const id of expiredIds) {
      await hardDeleteRecord(userId, id);
    }
    return NextResponse.json({ cleaned: expiredIds.length });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
