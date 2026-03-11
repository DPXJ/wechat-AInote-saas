"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncTarget } from "@/lib/types";

const targets: Array<{
  id: SyncTarget;
  label: string;
  hint: string;
}> = [
  {
    id: "notion",
    label: "同步到 Notion",
    hint: "沉淀资料",
  },
  {
    id: "ticktick-email",
    label: "投递到滴答清单",
    hint: "生成待办",
  },
];

export function RecordQuickActions({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<SyncTarget | "">("");
  const [message, setMessage] = useState("");

  async function run(target: SyncTarget) {
    setBusy(target);
    setMessage("");

    const response = await fetch(`/api/records/${recordId}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target }),
    });
    const payload = await response.json();

    setBusy("");
    if (response.ok) {
      setMessage(target === "notion" ? "已同步到 Notion。" : "已投递到滴答清单。");
      router.refresh();
      return;
    }

    setMessage(payload.error || "同步失败。");
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">手动同步</p>
        <p className="mt-1 text-xs text-[var(--muted)]">需要时可以再次推送到外部系统。</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => run(target.id)}
            disabled={Boolean(busy)}
            className={[
              "rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed",
              target.id === "ticktick-email"
                ? "border-slate-900 bg-slate-950 text-white hover:bg-slate-800 disabled:border-slate-400 disabled:bg-slate-400"
                : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--line-strong)]",
            ].join(" ")}
          >
            {busy === target.id ? "处理中..." : target.label}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-[var(--muted-strong)]">{message}</p> : null}
    </div>
  );
}
