"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] ai-dot-bg">
      <div className="ai-waves pointer-events-none fixed inset-0" />
      <div className="ai-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
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
          <p className="mt-1 text-sm text-[var(--muted)]">
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
              className="input-focus-bar w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] outline-none transition focus:border-[var(--line-strong)]"
            />
          </div>

          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码（至少 6 位）"
              className="input-focus-bar w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] outline-none transition focus:border-[var(--line-strong)]"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-rose-500">{error}</p>
          )}
          {message && (
            <p className="text-center text-sm text-emerald-500">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
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
            className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            {mode === "login"
              ? "没有账户？点击注册"
              : "已有账户？点击登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
