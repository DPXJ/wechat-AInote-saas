import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  if (!hasSupabasePublicEnv()) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/api")) {
      return NextResponse.next({ request });
    }
    const publicPaths = ["/login"];
    const isPublic =
      publicPaths.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon");
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("setup", "1");
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/api/auth"];
  const isPublic =
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /** 闪念 HTTP 接入：Bearer 令牌鉴权，不依赖浏览器会话 */
    pathname === "/api/flash-memos/ingest";

  if (!user && !isPublic) {
    // API 不要 302 到登录页（返回 HTML），否则前端 await res.json() 会报 Unexpected token '<'
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
