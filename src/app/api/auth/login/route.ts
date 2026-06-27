import { NextResponse } from "next/server";
import { formatAuthError } from "@/lib/auth-errors";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "服务端未配置 Supabase 环境变量" }, { status: 503 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "请填写邮箱和密码" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ error: formatAuthError(error.message, "登录失败") }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      user: { id: data.user?.id, email: data.user?.email },
    });
  } catch {
    return NextResponse.json(
      { error: "认证服务连接失败，请稍后重试（服务器可能无法访问 Supabase）" },
      { status: 502 },
    );
  }
}
