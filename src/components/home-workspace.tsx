"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetGallery } from "@/components/asset-gallery";
import { InboxForm } from "@/components/inbox-form";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { SearchPanel } from "@/components/search-panel";
import { StatsBar } from "@/components/stats-bar";
import { TodoPanel } from "@/components/todo-panel";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  RecordType,
  SyncRun,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type WorkspaceTab = "record" | "history" | "todos" | "search" | "settings";
type HistoryFilter = "all" | "text" | "image" | "video" | "audio" | "document" | "pdf" | "synced";

const PAGE_SIZE = 20;

const tabs: Array<{ id: WorkspaceTab; label: string; icon: string }> = [
  { id: "record", label: "开始记录", icon: "✦" },
  { id: "history", label: "历史", icon: "☰" },
  { id: "todos", label: "待办", icon: "☑" },
  { id: "search", label: "搜索", icon: "⌕" },
  { id: "settings", label: "设置", icon: "⚙" },
];

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本",
  image: "图片",
  pdf: "PDF",
  document: "文档",
  audio: "音频",
  video: "视频",
  mixed: "混合",
};

const recordTypeIcons: Record<RecordType, string> = {
  text: "📝",
  image: "📷",
  pdf: "📄",
  document: "📋",
  audio: "🎵",
  video: "🎬",
  mixed: "📦",
};

const syncTargetLabels: Record<SyncRun["target"], string> = {
  notion: "Notion",
  "ticktick-email": "滴答清单",
  "feishu-doc": "飞书文档",
};

const syncStatusStyles: Record<SyncRun["status"], { label: string; dot: string }> = {
  pending: { label: "处理中", dot: "bg-amber-400" },
  synced: { label: "已同步", dot: "bg-emerald-400" },
  failed: { label: "失败", dot: "bg-rose-400" },
};

const historyFilters: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "document", label: "文档" },
  { id: "pdf", label: "PDF" },
  { id: "synced", label: "已同步" },
];

export function HomeWorkspace({
  initialRecords,
  initialTotal,
  integrationSettings,
  integrationStatus,
}: {
  initialRecords: KnowledgeRecord[];
  initialTotal: number;
  integrationSettings: IntegrationSettings;
  integrationStatus: IntegrationStatus;
}) {
  const [activeTab, setActiveTabRaw] = useState<WorkspaceTab>("record");
  const tabRestoredRef = useRef(false);
  const [records, setRecords] = useState<KnowledgeRecord[]>(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [selectedRecordId, setSelectedRecordId] = useState(initialRecords[0]?.id || "");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-box-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ai-box-theme", theme);
  }, [theme]);

  const setActiveTab = useCallback((tab: WorkspaceTab) => {
    setActiveTabRaw(tab);
    window.sessionStorage.setItem("ai-box-tab", tab);
  }, []);

  useEffect(() => {
    if (tabRestoredRef.current) return;
    tabRestoredRef.current = true;
    const saved = window.sessionStorage.getItem("ai-box-tab");
    if (saved && ["record", "history", "todos", "search", "settings"].includes(saved)) {
      setActiveTabRaw(saved as WorkspaceTab);
    }
  }, []);

  const refreshRecords = useCallback(async () => {
    const res = await fetch(`/api/records?limit=${records.length || PAGE_SIZE}&offset=0`);
    const data = await res.json();
    setRecords(data.records);
    setTotal(data.total);
  }, [records.length]);

  const loadMore = useCallback(async () => {
    if (loadingMore || records.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/records?limit=${PAGE_SIZE}&offset=${records.length}`);
      const data = await res.json();
      setRecords((prev) => [...prev, ...data.records]);
      setTotal(data.total);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, records.length, total]);

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = window.confirm("确定删除此条记录？删除后不可恢复。");
      if (!ok) return;
      await fetch(`/api/records/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => prev - 1);
      if (selectedRecordId === id) setSelectedRecordId("");
    },
    [selectedRecordId],
  );

  const handleUpdate = useCallback(
    async (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => {
      const res = await fetch(`/api/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.record) {
        setRecords((prev) => prev.map((r) => (r.id === id ? data.record : r)));
      }
    },
    [],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (historyFilter === "synced") return r.syncRuns.some((run) => run.status === "synced");
      if (historyFilter === "all") return true;
      return r.recordType === historyFilter;
    });
  }, [historyFilter, records]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((r) => r.id === selectedRecordId) || filteredRecords[0] || null,
    [filteredRecords, selectedRecordId],
  );

  const showFloatingSearch = activeTab === "record" || activeTab === "history";

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ── Sidebar ── */}
        <aside className="hidden border-r border-[var(--line)] bg-[var(--sidebar-bg)] lg:block">
          <div className="sticky top-0 flex h-screen flex-col px-3 py-6">
            <div className="mb-10 px-3">
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                AI 信迹
              </h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">AI 知识收件箱</p>
            </div>

            <nav className="flex-1 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    activeTab === tab.id
                      ? "bg-[var(--sidebar-active)] font-semibold text-[var(--foreground)]"
                      : "text-[var(--muted-strong)] hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                  ].join(" ")}
                >
                  <span className="w-5 text-center text-base">{tab.icon}</span>
                  <span className="text-[15px]">{tab.label}</span>
                </button>
              ))}
            </nav>

            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[var(--muted)] transition hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]"
            >
              <span className="w-5 text-center text-base">
                {theme === "light" ? "☀" : "☾"}
              </span>
              <span className="text-[15px]">{theme === "light" ? "切换暗色" : "切换亮色"}</span>
            </button>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="min-w-0">
          {/* Mobile header */}
          <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--line)] bg-[var(--background)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <span className="mr-3 text-base font-bold text-[var(--foreground)]">AI 信迹</span>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  activeTab === tab.id
                    ? "bg-[var(--foreground)] font-medium text-[var(--background)]"
                    : "text-[var(--muted-strong)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))}
              className="ml-auto text-sm text-[var(--muted)]"
            >
              {theme === "light" ? "☀" : "☾"}
            </button>
          </header>

          <div className="p-5 lg:p-8">
            {/* Stats bar — show on record and history tabs */}
            {(activeTab === "record" || activeTab === "history") && <StatsBar />}

            {/* Inline AI Search bar — between stats and content */}
            {showFloatingSearch && (
              <button
                type="button"
                onClick={() => setActiveTab("search")}
                className="mb-6 flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-5 py-3 text-left transition hover:border-[var(--foreground)]/20"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--muted)]">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M12 12l4 4" />
                </svg>
                <span className="text-sm text-[var(--muted)]">AI 搜索：一句话找回原文...</span>
              </button>
            )}

            {/* ── Tab: Record ── */}
            {activeTab === "record" && (
              <InboxForm
                onCreated={async (id) => {
                  setSelectedRecordId(id);
                  await refreshRecords();
                }}
              />
            )}

            {/* ── Tab: History ── */}
            {activeTab === "history" && (
              <HistoryTab
                records={filteredRecords}
                total={total}
                hasMore={records.length < total}
                loadingMore={loadingMore}
                selectedRecord={selectedRecord}
                historyFilter={historyFilter}
                onFilterChange={setHistoryFilter}
                onSelectRecord={setSelectedRecordId}
                onLoadMore={loadMore}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            )}

            {/* ── Tab: Todos ── */}
            {activeTab === "todos" && <TodoPanel />}

            {/* ── Tab: Search ── */}
            {activeTab === "search" && <SearchPanel />}

            {/* ── Tab: Settings ── */}
            {activeTab === "settings" && (
              <IntegrationsPanel
                initialSettings={integrationSettings}
                initialStatus={integrationStatus}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ────────────────────────────────────────────────── */
/* History Tab                                         */
/* ────────────────────────────────────────────────── */

function HistoryTab({
  records,
  total,
  hasMore,
  loadingMore,
  selectedRecord,
  historyFilter,
  onFilterChange,
  onSelectRecord,
  onLoadMore,
  onDelete,
  onUpdate,
}: {
  records: KnowledgeRecord[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  selectedRecord: KnowledgeRecord | null;
  historyFilter: HistoryFilter;
  onFilterChange: (f: HistoryFilter) => void;
  onSelectRecord: (id: string) => void;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left: list */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {historyFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                historyFilter === item.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto text-sm text-[var(--muted)]">{total} 条</span>
        </div>

        <div className="space-y-1">
          {records.length > 0 ? (
            records.map((record) => {
              const active = selectedRecord?.id === record.id;
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onSelectRecord(record.id)}
                  className={[
                    "w-full rounded-xl px-4 py-3.5 text-left transition",
                    active
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "hover:bg-[var(--surface)]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {recordTypeIcons[record.recordType]}
                    </span>
                    <span
                      className={[
                        "text-[13px]",
                        active ? "text-white/70" : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {formatDateTime(record.createdAt)}
                    </span>
                    {record.syncRuns.some((r) => r.status === "synced") && (
                      <span
                        className={[
                          "ml-auto inline-block h-1.5 w-1.5 rounded-full",
                          active ? "bg-white/60" : "bg-emerald-400",
                        ].join(" ")}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[15px] font-medium leading-snug">
                    {record.title}
                  </p>
                  <p
                    className={[
                      "mt-1 line-clamp-2 text-[13px] leading-relaxed",
                      active ? "text-white/60" : "text-[var(--muted)]",
                    ].join(" ")}
                  >
                    {record.summary}
                  </p>
                  {/* Inline keywords */}
                  {record.keywords.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {record.keywords.slice(0, 3).map((kw) => (
                        <span
                          key={kw}
                          className={[
                            "rounded px-1.5 py-0.5 text-[11px]",
                            active
                              ? "bg-white/20 text-white/80"
                              : "bg-[var(--accent-soft)] text-[var(--accent)]",
                          ].join(" ")}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">📭</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无资料，先去收录。</p>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore ? (
                <span className="text-sm text-[var(--muted)]">加载中...</span>
              ) : (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--surface)]"
                >
                  加载更多
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail pane (simplified) */}
      {selectedRecord ? (
        <RecordPane
          record={selectedRecord}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--line)] py-24">
          <p className="text-sm text-[var(--muted)]">选择左侧资料查看详情</p>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/* Record Detail Pane (simplified inline)              */
/* ────────────────────────────────────────────────── */

function RecordPane({
  record,
  onDelete,
  onUpdate,
}: {
  record: KnowledgeRecord;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(record.title);
  const [editSource, setEditSource] = useState(record.sourceLabel);
  const [editNote, setEditNote] = useState(record.contextNote);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
    setEditTitle(record.title);
    setEditSource(record.sourceLabel);
    setEditNote(record.contextNote);
  }, [record.id, record.title, record.sourceLabel, record.contextNote]);

  const handleSave = async () => {
    setSaving(true);
    const fields: Record<string, string> = {};
    if (editTitle !== record.title) fields.title = editTitle;
    if (editSource !== record.sourceLabel) fields.sourceLabel = editSource;
    if (editNote !== record.contextNote) fields.contextNote = editNote;
    if (Object.keys(fields).length > 0) {
      await onUpdate(record.id, fields);
    }
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <span>{recordTypeIcons[record.recordType]}</span>
          {editing ? (
            <input
              value={editSource}
              onChange={(e) => setEditSource(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--foreground)]"
              placeholder="来源"
            />
          ) : (
            <span>{record.sourceLabel}</span>
          )}
          <span className="text-[var(--line-strong)]">·</span>
          <span>{recordTypeLabels[record.recordType]}</span>
          <span className="text-[var(--line-strong)]">·</span>
          <span>{formatDateTime(record.createdAt)}</span>
        </div>

        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xl font-bold text-[var(--foreground)]"
            placeholder="标题"
          />
        ) : (
          <h2 className="mt-2 text-xl font-bold leading-snug text-[var(--foreground)]">
            {record.title}
          </h2>
        )}
      </div>

      {/* Summary */}
      <p className="text-[15px] leading-7 text-[var(--muted-strong)]">{record.summary}</p>

      {/* Keywords */}
      {record.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Context note (editable) */}
      {editing ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            备注
          </p>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
            placeholder="备注信息（可选）"
          />
        </div>
      ) : record.contextNote ? (
        <div className="rounded-xl bg-[var(--surface)] px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            备注
          </p>
          <p className="text-sm leading-6 text-[var(--muted-strong)]">{record.contextNote}</p>
        </div>
      ) : null}

      {/* Assets preview */}
      {record.assets.length > 0 && <AssetGallery assets={record.assets} useThumbnails />}

      {/* Footer: actions */}
      <div className="flex items-center justify-between border-t border-[var(--line)] pt-4">
        <Link
          href={`/records/${record.id}`}
          className="text-sm font-medium text-[var(--accent)] transition hover:underline"
        >
          查看完整详情 →
        </Link>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                ✎ 编辑
              </button>
              <button
                type="button"
                onClick={() => onDelete(record.id)}
                className="rounded-lg px-3 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
              >
                🗑 删除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
