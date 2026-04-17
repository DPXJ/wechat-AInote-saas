"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FlashMemo, FlashMemoSource } from "@/lib/types";
import { CollapsibleMobileToolbar } from "@/components/collapsible-mobile-toolbar";

const sourceLabels: Record<FlashMemoSource, { label: string; className: string }> = {
  flomo: { label: "flomo", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  api: { label: "接口", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  web: { label: "本页", className: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
};

function formatBeijingTime(isoStr: string): string {
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

function formatDateLabel(isoStr: string): string {
  const d = new Date(isoStr);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (dStr === todayStr) return "今天";
  if (dStr === yStr) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getDateKey(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupByDate(items: FlashMemo[]): Array<{ dateKey: string; label: string; items: FlashMemo[] }> {
  const map = new Map<string, FlashMemo[]>();
  for (const m of items) {
    const key = getDateKey(m.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, groupItems]) => ({ dateKey: key, label: formatDateLabel(groupItems[0].createdAt), items: groupItems }));
}

type DateRangeFilter = "" | "today" | "last7";
type SourceFilter = "" | FlashMemoSource;

export function FlashMemoPanel() {
  const [memos, setMemos] = useState<FlashMemo[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("");
  const [dateFilter, setDateFilter] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<FlashMemo | null>(null);

  const fetchInFlightRef = useRef(false);
  const fetchMemos = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (searchDebounced.trim()) params.set("q", searchDebounced.trim());
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`/api/flash-memos?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        setMemos([]);
        return;
      }
      setMemos(Array.isArray(data.memos) ? data.memos : []);
    } catch {
      setMemos([]);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [searchDebounced, sourceFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchInput), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchMemos();
  }, [fetchMemos]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchMemos();
    }, 45000);
    const onFocus = () => {
      void fetchMemos();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchMemos]);

  const filteredMemos = useMemo(() => {
    let base = memos;
    if (dateRangeFilter === "today") {
      const t = new Date();
      const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      base = base.filter((m) => getDateKey(m.createdAt) === todayStr);
    } else if (dateRangeFilter === "last7") {
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - 6);
      base = base.filter((m) => new Date(m.createdAt) >= cutoff);
    } else if (dateFilter) {
      base = base.filter((m) => getDateKey(m.createdAt) === dateFilter);
    }
    return base;
  }, [memos, dateRangeFilter, dateFilter]);

  const groups = useMemo(() => groupByDate(filteredMemos), [filteredMemos]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const m of memos) set.add(getDateKey(m.createdAt));
    return Array.from(set).sort().reverse();
  }, [memos]);

  const handleCreate = async () => {
    if (!newContent.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flash-memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim(), source: "web" }),
        cache: "no-store",
      });
      if (res.ok) {
        setNewContent("");
        await fetchMemos();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定删除这条闪念？")) return;
    await fetch(`/api/flash-memos/${id}`, { method: "DELETE", cache: "no-store" });
    setDetail((d) => (d?.id === id ? null : d));
    await fetchMemos();
  };

  return (
    <div className="flex w-full shrink-0 flex-col">
      <CollapsibleMobileToolbar title="闪念：添加与筛选" className="shrink-0">
        <div className="space-y-4">
          <h2 className="hidden text-xl font-bold text-[var(--foreground)] lg:block">闪念</h2>
          <p className="text-sm text-[var(--muted-strong)]">
            与 flomo 并行使用：在其它工具里写入浮墨的同时，可调用接入接口把同一条同步到这里（见设置 → flomo）。
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="input-focus-bar flex-1">
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="记下闪念，回车或点击添加..."
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newContent.trim()}
              className="w-full shrink-0 rounded-xl bg-[var(--foreground)] px-4 py-2.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
            >
              添加
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="input-focus-bar flex-1">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索正文..."
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "today", label: "今日" },
                { id: "last7", label: "近七日" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setDateRangeFilter((v) => (v === f.id ? "" : f.id));
                  if (dateRangeFilter !== f.id) setDateFilter("");
                }}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  dateRangeFilter === f.id
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {f.label}
              </button>
            ))}

            {(["flomo", "api", "web"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSourceFilter((v) => (v === s ? "" : s))}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  sourceFilter === s
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {sourceLabels[s].label}
              </button>
            ))}

            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                if (e.target.value) setDateRangeFilter("");
              }}
              className="ml-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
            >
              <option value="">全部日期</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <span className="text-xs text-[var(--muted)]">{filteredMemos.length} 条</span>
          </div>
        </div>
      </CollapsibleMobileToolbar>

      <div className="mt-4 shrink-0">
        <div className="relative z-10 mx-auto max-w-4xl space-y-4 pb-8">
          {filteredMemos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">✦</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无闪念</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.dateKey}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--muted)]">{group.label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{group.dateKey}</span>
                  <div className="h-px flex-1 bg-[var(--line)]" />
                </div>
                <div className="space-y-4">
                  {group.items.map((memo, itemIdx) => {
                    const isLastInList =
                      group.dateKey === groups[groups.length - 1]?.dateKey &&
                      itemIdx === group.items.length - 1;
                    const sc = sourceLabels[memo.source];
                    return (
                      <div key={memo.id} className={isLastInList ? "mb-6" : ""}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetail(memo)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDetail(memo);
                            }
                          }}
                          className="group/card relative z-[1] cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 transition-all duration-300 ease-out hover:border-[var(--line-strong)] hover:shadow-sm"
                        >
                          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_200px] lg:items-stretch lg:gap-0">
                            <div className="min-w-0 border-b border-dashed border-[var(--line)] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                              <p className="text-sm font-medium leading-snug break-words text-[var(--foreground)] line-clamp-6">
                                {memo.content}
                              </p>
                              <div className="mt-1.5 text-[11px] text-[var(--muted)]">{formatBeijingTime(memo.createdAt)}</div>
                            </div>
                            <div
                              className="flex flex-wrap items-center justify-between gap-2 lg:min-w-[200px] lg:pl-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${sc.className}`}>
                                {sc.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDelete(memo.id)}
                                className="rounded-lg px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-500/10"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {filteredMemos.length > 0 && (
            <div className="pointer-events-none mx-auto h-28 w-full max-w-4xl shrink-0" aria-hidden />
          )}
        </div>
      </div>

      {detail &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              aria-label="关闭"
              onClick={() => setDetail(null)}
            />
            <div className="relative z-[1] m-0 flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl sm:rounded-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                <h3 className="text-lg font-bold text-[var(--foreground)]">闪念详情</h3>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  关闭
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">{detail.content}</p>
                <p className="mt-3 text-xs text-[var(--muted)]">{formatBeijingTime(detail.createdAt)} · {sourceLabels[detail.source].label}</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(detail.content);
                  }}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
                >
                  复制正文
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(detail.id)}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
                >
                  删除
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
