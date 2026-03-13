"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncTarget } from "@/lib/types";

const targets: Array<{
  id: SyncTarget;
  label: string;
  icon: string;
}> = [
  { id: "notion", label: "同步到 Notion", icon: "📓" },
  { id: "ticktick-email", label: "投递到滴答清单", icon: "✅" },
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
      headers: { "Content-Type": "application/json" },
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => run(target.id)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{target.icon}</span>
            {busy === target.id ? "处理中..." : target.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="text-sm text-[var(--muted-strong)]">{message}</p>
      )}
    </div>
  );
}
