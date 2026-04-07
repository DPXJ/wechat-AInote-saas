"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { LoginParticles } from "@/components/login-particles";

const REMEMBER_KEY = "ai-box-login-remember";
const SAVED_EMAIL_KEY = "ai-box-login-email";
const SAVED_PASSWORD_KEY = "ai-box-login-password";

const supabaseReady = hasSupabasePublicEnv();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
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
        "未配置 Supabase：在项目根目录创建 .env.local，填写 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY，保存后重启 npm run dev。",
      );
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowser();

    try {
      if (mode === "register") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setMessage("注册成功！请查看邮箱确认链接，或直接登录。");
          setMode("login");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
        } else {
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
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

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
                在项目根目录新建{" "}
                <code className="rounded bg-black/30 px-1 py-0.5 text-xs">.env.local</code>，从
                Supabase 控制台复制 Project URL 与 anon public key，写入：
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">
                {`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
              </pre>
              <p className="mt-2 text-amber-100/80">
                保存后<strong>重启</strong>开发服务（<code className="text-xs">npm run dev</code>
                ）。
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
              {mode === "login" ? "登录以继续" : "创建新账户"}
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

            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 6 位）"
                className="input-focus-bar w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[var(--line-strong)]"
              />
            </div>

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

            {error && (
              <p className="text-center text-sm text-rose-400">{error}</p>
            )}
            {message && (
              <p className="text-center text-sm text-emerald-400">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password || !supabaseReady}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--ai-gradient)" }}
            >
              {loading
                ? mode === "login"
                  ? "登录中…"
                  : "注册中…"
                : mode === "login"
                  ? "登录"
                  : "注册"}
            </button>
          </form>

          <div className="mt-6 text-center">
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
                : "已有账户？点击登录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
