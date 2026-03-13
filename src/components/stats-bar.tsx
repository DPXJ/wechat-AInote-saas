"use client";

import { useEffect, useState } from "react";
import type { StatsData } from "@/lib/types";

function IconTotal() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 7h6M7 10h6M7 13h3" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2v4M13 2v4" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="7.5" cy="7.5" r="1.5" />
      <path d="M17 13l-3.5-3.5L6 17" />
    </svg>
  );
}

function IconText() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h12M4 10h8M4 15h10" />
    </svg>
  );
}

function IconTodo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 10l2 2 4-4" />
    </svg>
  );
}

function IconUrgent() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3l7 12H3z" />
      <path d="M10 8v3M10 14v.5" />
    </svg>
  );
}

const statItems: Array<{
  key: keyof StatsData;
  label: string;
  icon: () => React.ReactElement;
  accent?: string;
}> = [
  { key: "totalRecords", label: "累计记录", icon: IconTotal },
  { key: "todayRecords", label: "今日新增", icon: IconToday },
  { key: "imageCount", label: "图片", icon: IconImage },
  { key: "textCount", label: "文本", icon: IconText },
  { key: "pendingTodos", label: "待办", icon: IconTodo },
  { key: "urgentTodos", label: "紧急待办", icon: IconUrgent, accent: "text-rose-400" },
];

export function StatsBar() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {statItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] px-3.5 py-3"
          >
            {/* Decorative background lines */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04]">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="100%" x2="100%" y2="0" stroke="currentColor" strokeWidth="1" />
                <line x1="20%" y1="100%" x2="100%" y2="30%" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>

            <div className={`shrink-0 ${item.accent || "text-[var(--muted)]"}`}>
              <Icon />
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-bold leading-tight ${item.accent || "text-[var(--foreground)]"}`}>
                {stats[item.key]}
              </p>
              <p className="text-[11px] text-[var(--muted)]">{item.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
