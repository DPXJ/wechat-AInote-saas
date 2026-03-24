import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodoStats } from "@/lib/todos";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const [
      totalRes,
      todayRes,
      imageRes,
      textRes,
      videoRes,
      documentRes,
    ] = await Promise.all([
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", `${today}T00:00:00`).lt("created_at", `${today}T23:59:59.999`),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("record_type", "image"),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("record_type", "text"),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("record_type", "video"),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).in("record_type", ["document", "pdf"]),
    ]);

    const totalRecords = totalRes.count ?? 0;
    const todayRecords = todayRes.count ?? 0;
    const imageCount = imageRes.count ?? 0;
    const textCount = textRes.count ?? 0;
    const videoCount = videoRes.count ?? 0;
    const documentCount = documentRes.count ?? 0;

    const todoStats = await getTodoStats(userId);

    return NextResponse.json(
      {
        totalRecords,
        todayRecords,
        imageCount,
        textCount,
        videoCount,
        documentCount,
        ...todoStats,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, must-revalidate",
        },
      },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
