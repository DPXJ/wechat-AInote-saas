"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncTarget } from "@/lib/types";

const targets: Array<{ id: SyncTarget; label: string }> = [
  { id: "notion", label: "同步到 Notion" },
  { id: "ticktick-email", label: "投递到滴答清单" },
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
      setMessage(target === "notion" ? "已同步到 Notion" : "已投递到滴答清单");
      router.refresh();
      return;
    }

    setMessage(payload.error || "同步失败");
  }

  return (
    <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium text-stone-900">快捷同步</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => run(target.id)}
            disabled={Boolean(busy)}
            className={[
              "rounded-full px-4 py-2 text-sm transition disabled:cursor-not-allowed",
              target.id === "ticktick-email"
                ? "bg-stone-950 text-stone-50 hover:bg-stone-800 disabled:bg-stone-400"
                : "border border-stone-300 text-stone-700 hover:border-stone-700 disabled:border-stone-200 disabled:text-stone-400",
            ].join(" ")}
          >
            {busy === target.id ? "处理中..." : target.label}
          </button>
        ))}
      </div>

      {message ? <p className="mt-3 text-xs text-stone-500">{message}</p> : null}
    </div>
  );
}
