"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecordTaskProjectLink } from "@/lib/projects";

/**
 * 资料详情：仅当存在「项目 · 任务」引用时展示，可跳转到项目并打开对应任务。
 * 无引用时不渲染任何占位文案。
 */
export function RecordProjectBacklinks({ recordId }: { recordId: string }) {
  const [links, setLinks] = useState<RecordTaskProjectLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/records/${encodeURIComponent(recordId)}/project-links`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { links?: RecordTaskProjectLink[] }) => {
        if (!cancelled) setLinks(Array.isArray(data.links) ? data.links : []);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  if (loading || links.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">项目中的引用</p>
      <ul className="mt-2 space-y-1.5">
        {links.map((row) => (
          <li key={`${row.projectId}-${row.taskId}`}>
            <Link
              href={`/?tab=projects&project=${encodeURIComponent(row.projectId)}&task=${encodeURIComponent(row.taskId)}`}
              className="block rounded-md px-1 py-1 text-[12px] leading-snug text-[var(--foreground)] transition hover:bg-[var(--card)]"
            >
              <span className="font-medium text-[var(--foreground)]">{row.projectName}</span>
              <span className="text-[var(--muted)]"> · </span>
              <span className="text-[var(--muted-strong)]">{row.taskPreview}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
