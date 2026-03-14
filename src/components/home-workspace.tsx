"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetGallery } from "@/components/asset-gallery";
import { InboxForm } from "@/components/inbox-form";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { SearchPanel } from "@/components/search-panel";
import { StatsBar } from "@/components/stats-bar";
import { TodoPanel } from "@/components/todo-panel";
import { RecordDetailModal } from "@/components/record-detail-modal";
import { ReportPanel } from "@/components/report-panel";
import { TagManager } from "@/components/tag-manager";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  RecordType,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type WorkspaceTab = "record" | "history" | "favorites" | "todos" | "search" | "reports" | "tags" | "settings";
type HistoryFilter = "all" | "text" | "image" | "video" | "audio" | "document" | "synced";
type DocSubFilter = "" | "pdf" | "word" | "excel" | "md";

const PAGE_SIZE = 20;

const tabs: Array<{ id: WorkspaceTab; label: string; icon: string }> = [
  { id: "record", label: "开始记录", icon: "✦" },
  { id: "todos", label: "待办", icon: "☑" },
  { id: "history", label: "历史", icon: "☰" },
  { id: "favorites", label: "收藏", icon: "★" },
  { id: "search", label: "搜索", icon: "⌕" },
  { id: "reports", label: "报告", icon: "📊" },
  { id: "tags", label: "标签", icon: "🏷" },
  { id: "settings", label: "设置", icon: "⚙" },
];

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本", image: "图片", pdf: "PDF", document: "文档", audio: "音频", video: "视频", mixed: "混合",
};

const historyFilters: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "document", label: "文档" },
  { id: "synced", label: "已同步" },
];

const docSubFilters: Array<{ id: DocSubFilter; label: string }> = [
  { id: "pdf", label: "PDF" },
  { id: "word", label: "Word" },
  { id: "excel", label: "Excel" },
  { id: "md", label: "MD" },
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
  const [docSubFilter, setDocSubFilter] = useState<DocSubFilter>("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailModalId, setDetailModalId] = useState<string | null>(null);
  const [pendingTodoCount, setPendingTodoCount] = useState(0);

  useEffect(() => {
    fetch("/api/todos?limit=1&status=pending")
      .then((r) => r.json())
      .then((d) => setPendingTodoCount(d.total || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-box-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
    const collapsed = window.localStorage.getItem("ai-box-sidebar-collapsed");
    if (collapsed === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ai-box-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("ai-box-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const setActiveTab = useCallback((tab: WorkspaceTab) => {
    setActiveTabRaw(tab);
    window.sessionStorage.setItem("ai-box-tab", tab);
  }, []);

  useEffect(() => {
    if (tabRestoredRef.current) return;
    tabRestoredRef.current = true;
    const saved = window.sessionStorage.getItem("ai-box-tab");
    if (saved && tabs.some((t) => t.id === saved)) {
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
      const ok = window.confirm("确定删除此条记录？记录将移至回收站（30天后自动清理）。");
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

  const handleHistoryFilterChange = useCallback((f: HistoryFilter) => {
    setHistoryFilter(f);
    if (f !== "document") setDocSubFilter("");
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (historyFilter === "synced") return r.syncRuns.some((run) => run.status === "synced");
      if (historyFilter === "all") return true;
      if (historyFilter === "document" && docSubFilter) {
        const ext = r.assets[0]?.originalName?.split(".").pop()?.toLowerCase() || "";
        if (docSubFilter === "pdf") return r.recordType === "pdf" || ext === "pdf";
        if (docSubFilter === "word") return ext === "doc" || ext === "docx";
        if (docSubFilter === "excel") return ext === "xls" || ext === "xlsx";
        if (docSubFilter === "md") return ext === "md";
        return r.recordType === "document";
      }
      if (historyFilter === "document") return r.recordType === "document" || r.recordType === "pdf";
      return r.recordType === historyFilter;
    });
  }, [historyFilter, docSubFilter, records]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((r) => r.id === selectedRecordId) || filteredRecords[0] || null,
    [filteredRecords, selectedRecordId],
  );

  const sidebarWidth = sidebarCollapsed ? "60px" : "220px";

  useKeyboardShortcuts({
    onSearch: () => setActiveTab("search"),
    onNewRecord: () => setActiveTab("record"),
    onCloseModal: () => setDetailModalId(null),
  });

  return (
    <main className="relative min-h-screen ai-glow-bg ai-dot-bg">
      {/* AI ambient wave animation */}
      <div className="ai-waves" />

      <div
        className="relative z-[1] mx-auto grid min-h-screen max-w-[1440px]"
        style={{ gridTemplateColumns: `minmax(0,1fr)` }}
      >
        {/* ── Sidebar ── */}
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--line)] bg-[var(--sidebar-bg)] transition-all duration-200 lg:block"
          style={{ width: sidebarWidth }}
        >
          <div className="flex h-full flex-col px-3 py-6">
            {!sidebarCollapsed && (
              <div className="mb-10 px-3">
                <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                  AI 信迹
                </h1>
                <p className="mt-1 text-[13px] text-[var(--muted)]">AI 知识收件箱</p>
              </div>
            )}
            {sidebarCollapsed && <div className="mb-6 text-center text-lg font-bold text-[var(--foreground)]">AI</div>}

            <nav className="flex-1 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={sidebarCollapsed ? tab.label : undefined}
                  className={[
                    "flex w-full items-center rounded-xl transition",
                    sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5 text-left",
                    activeTab === tab.id
                      ? "bg-[var(--sidebar-active)] font-semibold text-[var(--foreground)]"
                      : "text-[var(--muted-strong)] hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                  ].join(" ")}
                >
                  <span className="w-5 text-center text-base">{tab.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="flex flex-1 items-center justify-between text-[15px]">
                      {tab.label}
                      {tab.id === "todos" && pendingTodoCount > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {pendingTodoCount > 99 ? "99+" : pendingTodoCount}
                        </span>
                      )}
                    </span>
                  )}
                  {sidebarCollapsed && tab.id === "todos" && pendingTodoCount > 0 && (
                    <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                </button>
              ))}
            </nav>

            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))}
              title={sidebarCollapsed ? (theme === "light" ? "切换暗色" : "切换亮色") : undefined}
              className={[
                "flex items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5 text-left",
              ].join(" ")}
            >
              <span className="w-5 text-center text-base">
                {theme === "light" ? "☀" : "☾"}
              </span>
              {!sidebarCollapsed && (
                <span className="text-[15px]">{theme === "light" ? "切换暗色" : "切换亮色"}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="mt-2 flex items-center justify-center rounded-xl py-2 text-[var(--muted)] transition hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]"
              title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: sidebarCollapsed ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}>
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="min-w-0 transition-all duration-200 lg:ml-[var(--sidebar-w)]" style={{ "--sidebar-w": sidebarWidth } as React.CSSProperties}>
          {/* Mobile top bar */}
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--background)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <span className="text-base font-bold text-[var(--foreground)]">AI 信迹</span>
            <div className="flex items-center gap-2">
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))}
                className="text-sm text-[var(--muted)]"
              >
                {theme === "light" ? "☀" : "☾"}
              </button>
            </div>
          </header>

          {/* Mobile bottom tab bar */}
          <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[var(--line)] bg-[var(--background)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {tabs.slice(0, 5).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition",
                  activeTab === tab.id
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)]",
                ].join(" ")}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.id === "todos" && pendingTodoCount > 0 && (
                  <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-rose-500" />
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={[
                "flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition",
                activeTab === "settings"
                  ? "font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)]",
              ].join(" ")}
            >
              <span className="text-lg">⚙</span>
              <span>设置</span>
            </button>
          </nav>

          <div className="p-4 pb-24 lg:p-8 lg:pb-8">
            {(activeTab === "record" || activeTab === "history") && (
              <StatsBar onNavigateToTodos={() => setActiveTab("todos")} />
            )}

            {activeTab === "record" && (
              <InboxForm
                onCreated={async (id) => { setSelectedRecordId(id); await refreshRecords(); }}
                onSwitchToSearch={() => setActiveTab("search")}
              />
            )}

            {activeTab === "history" && (
              <HistoryTab
                records={filteredRecords}
                total={total}
                hasMore={records.length < total}
                loadingMore={loadingMore}
                selectedRecord={selectedRecord}
                historyFilter={historyFilter}
                docSubFilter={docSubFilter}
                onFilterChange={handleHistoryFilterChange}
                onDocSubFilterChange={setDocSubFilter}
                onSelectRecord={setSelectedRecordId}
                onLoadMore={loadMore}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onOpenDetail={setDetailModalId}
                onSwitchToSearch={() => setActiveTab("search")}
              />
            )}

            {activeTab === "favorites" && (
              <FavoritesTab
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onOpenDetail={setDetailModalId}
              />
            )}

            {activeTab === "todos" && <TodoPanel />}
            {activeTab === "search" && <SearchPanel />}
            {activeTab === "reports" && <ReportPanel />}
            {activeTab === "tags" && <TagManager />}
            {activeTab === "settings" && (
              <IntegrationsPanel initialSettings={integrationSettings} initialStatus={integrationStatus} />
            )}
          </div>
        </div>
      </div>

      {/* Record Detail Modal */}
      {detailModalId && (
        <RecordDetailModal
          recordId={detailModalId}
          onClose={() => setDetailModalId(null)}
          onDelete={async (id) => {
            await handleDelete(id);
            setDetailModalId(null);
          }}
          onUpdate={handleUpdate}
        />
      )}
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
  docSubFilter,
  onFilterChange,
  onDocSubFilterChange,
  onSelectRecord,
  onLoadMore,
  onDelete,
  onUpdate,
  onOpenDetail,
  onSwitchToSearch,
}: {
  records: KnowledgeRecord[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  selectedRecord: KnowledgeRecord | null;
  historyFilter: HistoryFilter;
  docSubFilter: DocSubFilter;
  onFilterChange: (f: HistoryFilter) => void;
  onDocSubFilterChange: (f: DocSubFilter) => void;
  onSelectRecord: (id: string) => void;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => void;
  onOpenDetail: (id: string) => void;
  onSwitchToSearch: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div>
      {/* Top bar: filters + doc sub-filters inline + AI search */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {historyFilters.map((item) => {
          const isDoc = item.id === "document";
          return (
            <span key={item.id} className="contents">
              <button
                type="button"
                onClick={() => onFilterChange(item.id)}
                className={[
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  historyFilter === item.id
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {item.label}
              </button>

              {isDoc && historyFilter === "document" && (
                <>
                  <span className="mx-0.5 text-[var(--line-strong)]">|</span>
                  {docSubFilters.map((sf) => (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => onDocSubFilterChange(docSubFilter === sf.id ? "" : sf.id)}
                      className={[
                        "rounded-md px-2 py-1 text-[11px] font-medium transition",
                        docSubFilter === sf.id
                          ? "bg-[var(--foreground)] text-[var(--background)]"
                          : "bg-[var(--surface)] text-[var(--muted-strong)] hover:text-[var(--foreground)]",
                      ].join(" ")}
                    >
                      {sf.label}
                    </button>
                  ))}
                </>
              )}
            </span>
          );
        })}

        <span className="text-xs text-[var(--muted)]">{total} 条</span>

        <button
          type="button"
          onClick={onSwitchToSearch}
          className="ai-border ml-auto flex items-center gap-2 rounded-lg bg-[var(--card)] px-3 py-1.5 text-left transition"
        >
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
            <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
          </svg>
          <span className="text-xs text-[var(--muted)]">AI 搜索</span>
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]" style={{ height: "calc(100vh - 240px)" }}>
        {/* Left: independently scrollable list */}
        <div className="overflow-y-auto pr-1" style={{ scrollbarGutter: "stable" }}>
          {records.length > 0 ? (
            <div className="divide-y divide-dashed divide-[var(--line)]">
              {records.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => onSelectRecord(record.id)}
                    className={[
                      "relative w-full px-4 py-5 text-left transition",
                      active
                        ? "bg-[var(--surface-strong)]"
                        : "hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--muted)]">{recordTypeLabels[record.recordType]}</span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {formatDateTime(record.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2.5 truncate text-base font-bold leading-snug text-[var(--foreground)]">
                      {record.title}
                    </p>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      {record.summary}
                    </p>
                    {record.keywords.length > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
                        {record.keywords.slice(0, 4).map((kw) => (
                          <span
                            key={kw}
                            className="shrink-0 rounded bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted-strong)]"
                          >
                            {kw}
                          </span>
                        ))}
                        {record.syncRuns.some((r) => r.status === "synced") && (
                          <span className="ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">📭</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无资料，先去收录。</p>
            </div>
          )}

          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore ? (
                <span className="text-sm text-[var(--muted)]">加载中...</span>
              ) : (
                <button type="button" onClick={onLoadMore} className="rounded-lg px-4 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)]">
                  加载更多
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: independently scrollable detail pane */}
        {selectedRecord ? (
          <RecordPane
            record={selectedRecord}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onOpenDetail={onOpenDetail}
          />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--line)] py-24">
            <p className="text-sm text-[var(--muted)]">选择左侧资料查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/* Favorites Tab                                       */
/* ────────────────────────────────────────────────── */

function FavoritesTab({
  onDelete,
  onUpdate,
  onOpenDetail,
}: {
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => void;
  onOpenDetail: (id: string) => void;
}) {
  const [records, setRecords] = useState<KnowledgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState("");

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/favorites");
      const data = await res.json();
      setRecords(data.records || []);
      if (data.records?.length > 0 && !selectedRecordId) {
        setSelectedRecordId(data.records[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedRecordId]);

  useEffect(() => { fetchFavorites(); }, []);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) || records[0] || null,
    [records, selectedRecordId],
  );

  const handleUnfavorite = useCallback(async (recordId: string) => {
    await fetch(`/api/favorites/${recordId}`, { method: "DELETE" });
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-[var(--muted)]">加载中...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--foreground)]">★ 我的收藏</span>
        <span className="text-xs text-[var(--muted)]">{records.length} 条</span>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <span className="text-3xl">☆</span>
          <p className="mt-3 text-sm text-[var(--muted)]">暂无收藏，在记录详情中点击 ★ 添加收藏。</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]" style={{ height: "calc(100vh - 240px)" }}>
          <div className="overflow-y-auto pr-1" style={{ scrollbarGutter: "stable" }}>
            <div className="divide-y divide-dashed divide-[var(--line)]">
              {records.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedRecordId(record.id)}
                    className={[
                      "relative w-full px-4 py-5 text-left transition",
                      active
                        ? "bg-[var(--surface-strong)]"
                        : "hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--muted)]">{recordTypeLabels[record.recordType]}</span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {formatDateTime(record.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2.5 truncate text-base font-bold leading-snug text-[var(--foreground)]">
                      {record.title}
                    </p>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      {record.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedRecord ? (
            <RecordPane
              record={selectedRecord}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onOpenDetail={onOpenDetail}
              favorited
              onToggleFavorite={() => handleUnfavorite(selectedRecord.id)}
            />
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--line)] py-24">
              <p className="text-sm text-[var(--muted)]">选择左侧收藏查看详情</p>
            </div>
          )}
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
  onOpenDetail,
  favorited: initialFavorited,
  onToggleFavorite,
}: {
  record: KnowledgeRecord;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string }) => void;
  onOpenDetail: (id: string) => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(record.title);
  const [editSource, setEditSource] = useState(record.sourceLabel);
  const [editNote, setEditNote] = useState(record.contextNote);
  const [saving, setSaving] = useState(false);
  const [isFav, setIsFav] = useState(initialFavorited ?? false);

  useEffect(() => {
    setEditing(false);
    setEditTitle(record.title);
    setEditSource(record.sourceLabel);
    setEditNote(record.contextNote);
  }, [record.id, record.title, record.sourceLabel, record.contextNote]);

  useEffect(() => {
    if (initialFavorited !== undefined) {
      setIsFav(initialFavorited);
      return;
    }
    let cancelled = false;
    fetch(`/api/favorites`).then(r => r.json()).then(data => {
      if (cancelled) return;
      const ids = (data.records || []).map((r: KnowledgeRecord) => r.id);
      setIsFav(ids.includes(record.id));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [record.id, initialFavorited]);

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

  const toggleFavorite = async () => {
    if (onToggleFavorite) {
      onToggleFavorite();
      setIsFav(false);
      return;
    }
    if (isFav) {
      await fetch(`/api/favorites/${record.id}`, { method: "DELETE" });
      setIsFav(false);
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id }),
      });
      setIsFav(true);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* Meta info */}
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          {editing ? (
            <div className="input-focus-bar">
              <input
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                placeholder="来源"
              />
            </div>
          ) : (
            <span>{record.sourceLabel}</span>
          )}
          <span className="text-[var(--line-strong)]">·</span>
          <span>{recordTypeLabels[record.recordType]}</span>
          <span className="text-[var(--line-strong)]">·</span>
          <span>{formatDateTime(record.createdAt)}</span>
        </div>

        {editing ? (
          <div className="input-focus-bar mt-3">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xl font-bold text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
              placeholder="标题"
            />
          </div>
        ) : (
          <h2 className="mt-3 text-xl font-bold leading-snug text-[var(--foreground)]">
            {record.title}
          </h2>
        )}

        <div className="my-5 border-t border-dashed border-[var(--line)]" />

        <p className="text-[15px] leading-8 text-[var(--muted-strong)]">{record.summary}</p>

        {/* Show OCR/description for image records */}
        {record.assets.some((a) => a.ocrText || a.description) && (
          <div className="mt-4 space-y-3">
            {record.assets.filter((a) => a.ocrText || a.description).map((asset) => (
              <div key={asset.id} className="rounded-xl bg-[var(--surface)] px-4 py-3">
                {asset.description && (
                  <div className="mb-2">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">图片描述</p>
                    <p className="text-sm leading-6 text-[var(--muted-strong)]">{asset.description}</p>
                  </div>
                )}
                {asset.ocrText && (
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">OCR 识别文字</p>
                    <p className="text-sm leading-6 text-[var(--muted-strong)] whitespace-pre-wrap">{asset.ocrText}</p>
                  </div>
                )}
                {asset.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {asset.tags.map((t) => (
                      <span key={t} className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {record.keywords.length > 0 && (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <div className="flex flex-wrap gap-2">
              {record.keywords.map((kw) => (
                <span key={kw} className="rounded-md bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted-strong)]">
                  {kw}
                </span>
              ))}
            </div>
          </>
        )}

        {editing ? (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">备注</p>
              <div className="input-focus-bar">
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                  placeholder="备注信息（可选）"
                />
              </div>
            </div>
          </>
        ) : record.contextNote ? (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <div className="rounded-xl bg-[var(--surface)] px-4 py-3.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">备注</p>
              <p className="text-sm leading-7 text-[var(--muted-strong)]">{record.contextNote}</p>
            </div>
          </>
        ) : null}

        {record.assets.length > 0 && (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <AssetGallery assets={record.assets} useThumbnails />
          </>
        )}
      </div>

      {/* Fixed footer */}
      <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenDetail(record.id)}
            className="text-sm font-medium text-[var(--muted-strong)] transition hover:text-[var(--foreground)]"
          >
            详情 →
          </button>
          <button
            type="button"
            onClick={toggleFavorite}
            className={[
              "text-base transition",
              isFav ? "text-amber-400" : "text-[var(--muted)] hover:text-amber-400",
            ].join(" ")}
            title={isFav ? "取消收藏" : "添加收藏"}
          >
            {isFav ? "★" : "☆"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface)]">
                取消
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                ✎ 编辑
              </button>
              <button type="button" onClick={() => onDelete(record.id)} className="rounded-lg px-3 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10">
                🗑 删除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
