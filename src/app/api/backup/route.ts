import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TABLES = ["records", "assets", "todos", "favorites", "settings"] as const;

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

    const backup: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const { data } = await supabase.from(table).select("*").eq("user_id", userId);
      backup[table] = data ?? [];
    }

    const json = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ai-signal-backup-${timestamp}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "备份失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "请上传备份文件" }, { status: 400 });
    }

    const text = await file.text();
    let backup: Record<string, unknown[]>;
    try {
      backup = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "无效的备份文件格式" }, { status: 400 });
    }

    for (const table of TABLES) {
      if (!backup[table] || !Array.isArray(backup[table])) continue;
      await supabase.from(table).delete().eq("user_id", userId);
      const rows = backup[table].map((row: any) => ({ ...row, user_id: userId }));
      if (rows.length > 0) {
        await supabase.from(table).upsert(rows);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "数据已从备份恢复，请刷新页面。",
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "恢复失败" },
      { status: 500 },
    );
  }
}
