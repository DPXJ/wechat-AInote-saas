import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const expected = process.env.HEALTHCHECK_TOKEN?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const token = request.headers.get("x-healthcheck-token") || url.searchParams.get("token");
  return token === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const checks: Record<string, unknown> = {
    app: "ok",
    supabaseEnv: hasSupabasePublicEnv() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  try {
    if (!checks.supabaseEnv) {
      return NextResponse.json(
        { ok: false, checks, error: "Supabase environment variables are incomplete" },
        { status: 503 },
      );
    }

    const { count, error } = await getSupabaseAdmin()
      .from("records")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, checks: { ...checks, supabase: "failed" }, error: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        checks: {
          ...checks,
          supabase: "ok",
          recordsCount: count ?? 0,
        },
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        checks: { ...checks, supabase: "failed" },
        error: err instanceof Error ? err.message : "Health check failed",
      },
      { status: 503 },
    );
  }
}
