"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { LoginParticles } from "@/components/login-particles";

const REMEMBER_KEY = "ai-box-login-remember";
const SAVED_EMAIL_KEY = "ai-box-login-email";
const SAVED_PASSWORD_KEY = "ai-box-login-password";

const supabaseReady = hasSupabasePublicEnv();

type AuthMode = "login" | "register" | "forgot";

async function postAuth(path: string, body: Record<string, string>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error(data.error || "请求失败，请重试");
  }
  return data;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const router = useRouter();

  useEffect(() => {
    try {
      const remember = localStorage.getItem(REMEMBER_KEY) === "1";
      setRememberPassword(remember);
      if (remember) {
        setEmail(localStorage.getItem(SAVED_EMAIL_KEY) || "");
        setPassword(localStorage.getItem(SAVED_PASSWORD_KEY) || "");
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (!supabaseReady) {
      setError(
        "未配置 Supabase：在服务器 .env.production 中填写 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY，重新 build 并重启。",
      );
      setLoading(false);
      return;
    }

    try {
      if (mode === "register") {
        await postAuth("/api/auth/register", { email, password });
        setMessage("注册成功！若启用了邮箱确认，请先查收邮件；否则可直接登录。");
        setMode("login");
      } else if (mode === "forgot") {
        await postAuth("/api/auth/reset-password", { email });
        setMessage("重置邮件已发送，请查收邮箱（含垃圾箱）。点击邮件中的链接后可设置新密码。");
        setMode("login");
      } else {
        await postAuth("/api/auth/login", { email, password });
        try {
          if (rememberPassword) {
            localStorage.setItem(REMEMBER_KEY, "1");
            localStorage.setItem(SAVED_EMAIL_KEY, email);
            localStorage.setItem(SAVED_PASSWORD_KEY, password);
          } else {
            localStorage.removeItem(REMEMBER_KEY);
            localStorage.removeItem(SAVED_EMAIL_KEY);
            localStorage.removeItem(SAVED_PASSWORD_KEY);
          }
        } catch {
          /* ignore */
        }
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel =
    mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置邮件";
  const loadingLabel =
    mode === "login" ? "登录中…" : mode === "register" ? "注册中…" : "发送中…";

  return (
    <div className="login-page flex min-h-screen items-center justify-center">
      <div className="login-lines" />
      <LoginParticles />
      <div className="ai-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="login-card rounded-2xl p-8 backdrop-blur-xl">
          {!supabaseReady && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100">
              <p className="font-medium text-amber-50">需要先配置 Supabase</p>
              <p className="mt-2 text-amber-100/90">
                在服务器项目根目录的{" "}
                <code className="rounded bg-black/30 px-1 py-0.5 text-xs">.env.production</code>{" "}
                中配置：
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">
                {`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
APP_BASE_URL=https://你的域名`}
              </pre>
              <p className="mt-2 text-amber-100/80">
                保存后执行 <code className="text-xs">npm run build</code> 并重启 PM2。
              </p>
            </div>
          )}
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "var(--ai-gradient)" }}
            >
              <span className="text-white">✦</span>
            </div>
            <h1
              className="bg-clip-text text-2xl font-bold text-transparent"
              style={{ backgroundImage: "var(--ai-gradient)" }}
            >
              AI 信迹
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {mode === "login"
                ? "登录以继续"
                : mode === "register"
                  ? "创建新账户"
                  : "找回密码"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱地址"
                autoFocus
                className="input-focus-bar w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[var(--line-strong)]"
              />
            </div>

            {mode !== "forgot" && (
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码（至少 6 位）"
                  className="input-focus-bar w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[var(--line-strong)]"
                />
              </div>
            )}

            {mode === "login" && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-transparent accent-violet-500"
                />
                记住密码（仅保存在本机浏览器）
              </label>
            )}

            {error && <p className="text-center text-sm text-rose-400">{error}</p>}
            {message && <p className="text-center text-sm text-emerald-400">{message}</p>}

            <button
              type="submit"
              disabled={
                loading ||
                !email ||
                (mode !== "forgot" && !password) ||
                !supabaseReady
              }
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--ai-gradient)" }}
            >
              {loading ? loadingLabel : submitLabel}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
                className="block w-full text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                忘记密码？发送重置邮件
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
              }}
              className="text-sm text-zinc-400 transition hover:text-zinc-200"
            >
              {mode === "login"
                ? "没有账户？点击注册"
                : mode === "register"
                  ? "已有账户？点击登录"
                  : "返回登录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
