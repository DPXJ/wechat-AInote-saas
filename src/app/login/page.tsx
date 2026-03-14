"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "认证失败");
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
            请输入密码以继续
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="访问密码"
              autoFocus
              className="input-focus-bar w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] outline-none transition focus:border-[var(--line-strong)]"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-[var(--danger)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: "var(--ai-gradient)" }}
          >
            {loading ? "验证中…" : "进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
