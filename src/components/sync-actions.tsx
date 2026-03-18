"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncTarget } from "@/lib/types";

const targets: Array<{ id: SyncTarget; label: string; enabled: boolean }> = [
  { id: "notion", label: "同步到 Notion", enabled: true },
  { id: "ticktick-email", label: "邮件投递到滴答", enabled: true },
  { id: "feishu-doc", label: "飞书文档（预留）", enabled: false },
  { id: "flomo", label: "同步到 flomo", enabled: true },
];

export function SyncActions({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loadingTarget, setLoadingTarget] = useState<string>("");

  async function run(target: SyncTarget) {
    setLoadingTarget(target);
    setMessage("正在同步...");
    const response = await fetch(`/api/records/${recordId}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || "同步失败");
      setLoadingTarget("");
      return;
    }

    setMessage("同步成功，已记录到历史。");
    setLoadingTarget("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={!target.enabled || Boolean(loadingTarget)}
            onClick={() => run(target.id)}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm transition hover:border-stone-700 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
          >
            {loadingTarget === target.id ? "处理中..." : target.label}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-stone-600">{message}</p> : null}
    </div>
  );
}
