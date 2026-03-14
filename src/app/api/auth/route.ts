import { NextResponse, type NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "ai-signal-deck-default-secret-change-me",
  );
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const expected = process.env.AUTH_PASSWORD;

    if (!expected) {
      return NextResponse.json({ error: "认证未配置" }, { status: 500 });
    }

    if (password !== expected) {
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }

    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getSecret());

    const res = NextResponse.json({ ok: true });
    res.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "请求解析失败" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("auth_token");
  return res;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }
  try {
    await jwtVerify(token, getSecret());
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
