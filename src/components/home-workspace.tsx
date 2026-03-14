"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetGallery } from "@/components/asset-gallery";
import { InboxForm } from "@/components/inbox-form";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { StatsBar } from "@/components/stats-bar";
import { TodoPanel } from "@/components/todo-panel";
import { RecordDetailModal } from "@/components/record-detail-modal";
import { ReportPanel } from "@/components/report-panel";
import { TagManager } from "@/components/tag-manager";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  RecordType,
} from "@/lib/types";
import { formatDateTime, formatDateOnly, formatTime } from "@/lib/utils";

type WorkspaceTab = "record" | "history" | "favorites" | "todos" | "reports" | "tags" | "settings";
type HistoryFilter = "all" | "text" | "image" | "video" | "audio" | "document" | "synced";
type DocSubFilter = "" | "pdf" | "word" | "excel" | "md";

const PAGE_SIZE = 20;

function TabIcon({ id, className = "w-[18px] h-[18px]" }: { id: string; className?: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (id) {
    case "record": return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "todos": return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 12l2 2 4-4" /></svg>;
    case "history": return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case "favorites": return <svg {...props} fill="none"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" /></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "reports": return <svg {...props}><path d="M3 3v18h18" /><path d="M7 17V13M11 17V9M15 17V5M19 17v-6" /></svg>;
    case "tags": return <svg {...props}><path d="M4 4h6l10 10-6 6L4 10V4z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default: return null;
  }
}

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "record", label: "开始记录" },
  { id: "todos", label: "待办" },
  { id: "history", label: "历史" },
  { id: "favorites", label: "收藏" },
  { id: "reports", label: "报告" },
  { id: "tags", label: "标签" },
  { id: "settings", label: "设置" },
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
  const router = useRouter();
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
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

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

  const sidebarInnerWidth = sidebarCollapsed ? 60 : 220;
  const sidebarWidth = `${sidebarInnerWidth}px`;
  const contentOffset = `${sidebarInnerWidth + 48}px`;

  useKeyboardShortcuts({
    onSearch: () => setActiveTab("history"),
    onNewRecord: () => setActiveTab("record"),
    onCloseModal: () => setDetailModalId(null),
  });

  return (
    <main className="relative min-h-screen ai-glow-bg ai-dot-bg">
      {/* AI ambient animations */}
      <div className="ai-waves" />
      <div className="ai-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div
        className="relative z-[1] mx-auto grid min-h-screen max-w-[1440px]"
        style={{ gridTemplateColumns: `minmax(0,1fr)` }}
      >
        {/* ── Sidebar (floating) ── */}
        <aside
          className="fixed z-30 hidden lg:block transition-all duration-200"
          style={{ width: sidebarWidth, top: 24, left: 24, bottom: 24 }}
        >
          <div className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--sidebar-bg)] px-3 py-5 shadow-sm">
            {!sidebarCollapsed && (
              <div className="mb-8 px-3">
                <h1 className="text-lg font-bold tracking-tight text-[var(--foreground)]">
                  AI 信迹
                </h1>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">AI 知识收件箱</p>
              </div>
            )}
            {sidebarCollapsed && <div className="mb-5 text-center text-lg font-bold text-[var(--foreground)]">AI</div>}

            <nav className="flex-1 space-y-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={sidebarCollapsed ? tab.label : undefined}
                  className={[
                    "relative flex w-full items-center rounded-xl transition",
                    sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5 text-left",
                    activeTab === tab.id
                      ? "bg-[var(--sidebar-active)] font-semibold text-[var(--foreground)]"
                      : "text-[var(--muted-strong)] hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                  ].join(" ")}
                >
                  <span className="flex w-5 items-center justify-center"><TabIcon id={tab.id} /></span>
                  {!sidebarCollapsed && (
                    <span className="flex flex-1 items-center justify-between text-[14px]">
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

            {/* Account center */}
            <div className={[
              "mb-2 flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]/50 transition",
              sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
            ].join(" ")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-cyan-400 text-[11px] font-bold text-white">
                {userEmail ? userEmail[0].toUpperCase() : "U"}
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--foreground)]">{userEmail || "用户"}</p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="truncate text-[11px] text-[var(--muted)] transition hover:text-rose-500"
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>

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
              <span className="flex w-5 items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {theme === "light" ? <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
                </svg>
              </span>
              {!sidebarCollapsed && (
                <span className="text-[14px]">{theme === "light" ? "切换暗色" : "切换亮色"}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className={[
                "mt-1 flex items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                sidebarCollapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2 text-left",
              ].join(" ")}
              title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
            >
              <span className="flex w-5 items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: sidebarCollapsed ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                  <path d="M14 9l-3 3 3 3" />
                </svg>
              </span>
              {!sidebarCollapsed && <span className="text-[14px]">收起菜单</span>}
            </button>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="min-w-0 transition-all duration-200 lg:ml-[var(--sidebar-w)]" style={{ "--sidebar-w": contentOffset } as React.CSSProperties}>
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
                <TabIcon id={tab.id} className="w-5 h-5" />
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
              <TabIcon id="settings" className="w-5 h-5" />
              <span>设置</span>
            </button>
          </nav>

          <div className="flex h-screen flex-col p-4 pb-24 lg:px-6 lg:pb-[24px] lg:pt-[24px]">
            {(activeTab === "record" || activeTab === "history") && (
              <StatsBar onNavigateToTodos={() => setActiveTab("todos")} />
            )}

            <div className="content-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5 shadow-sm backdrop-blur-sm lg:p-6">
              {activeTab === "record" && (
                <InboxForm
                  onCreated={async (id) => { setSelectedRecordId(id); await refreshRecords(); }}
                  onSwitchToSearch={() => setActiveTab("history")}
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
              {activeTab === "reports" && <ReportPanel />}
              {activeTab === "tags" && <TagManager />}
              {activeTab === "settings" && (
                <IntegrationsPanel initialSettings={integrationSettings} initialStatus={integrationStatus} />
              )}
            </div>
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
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchCitations, setSearchCitations] = useState<Array<{ recordId: string; title: string; snippet: string; sourceLabel: string; score: number; reason?: string }>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchActive(true);
    setSearchLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: searchQuery.trim(), history: [] }),
      });
      const data = await res.json();
      setSearchAnswer(data.answer || "");
      setSearchCitations(data.citations || []);
      if (data.citations?.length > 0) {
        onSelectRecord(data.citations[0].recordId);
      }
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, onSelectRecord]);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchAnswer("");
    setSearchCitations([]);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: filters + AI search input */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-1.5">
        {!searchActive && historyFilters.map((item) => {
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

        {!searchActive && <span className="text-xs text-[var(--muted)]">{total} 条</span>}

        {searchActive ? (
          <div className="ai-border flex flex-1 items-center gap-2 rounded-xl bg-[var(--card)] p-1">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-3 shrink-0 text-[var(--muted)]">
              <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
            </svg>
            <input
              ref={searchInputRef}
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSearch(); } }}
              placeholder="AI 搜索：一句话找回原文和出处..."
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="shrink-0 rounded-lg bg-[var(--foreground)] px-4 py-1.5 text-xs font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
            >
              {searchLoading ? "搜索中..." : "搜索"}
            </button>
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setSearchActive(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            className="ai-border ml-auto flex items-center gap-2 rounded-lg bg-[var(--card)] px-3 py-1.5 text-left transition"
          >
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
              <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
            </svg>
            <span className="text-xs text-[var(--muted)]">AI 搜索</span>
          </button>
        )}
      </div>

      {/* AI answer banner */}
      {searchActive && searchAnswer && (
        <div className="mb-4 shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <p className="text-[13px] leading-7 text-[var(--foreground)]">{searchAnswer}</p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-5 overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Left: independently scrollable list */}
        <div className="hide-scrollbar min-h-0 overflow-y-auto">
          {searchActive && searchCitations.length > 0 ? (
            <div>
              <p className="px-1 py-1.5 text-[11px] font-medium text-[var(--muted)]">搜索到 {searchCitations.length} 条相关记录</p>
              {searchCitations.map((c) => {
                const active = selectedRecord?.id === c.recordId;
                return (
                  <button
                    key={c.recordId}
                    type="button"
                    onClick={() => onSelectRecord(c.recordId)}
                    className={[
                      "relative w-full border-b border-dashed px-3 py-2.5 text-left transition",
                      active
                        ? "border-[var(--line-strong)] bg-[var(--surface-strong)]"
                        : "border-[var(--line)] hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--muted)]">{c.sourceLabel}</span>
                    </div>
                    <p className="mt-1 truncate text-[14px] font-semibold leading-snug text-[var(--foreground)]">{c.title}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted)]">{c.snippet}</p>
                    {c.reason && <p className="mt-1 text-[10px] text-[var(--muted)]">{c.reason}</p>}
                  </button>
                );
              })}
            </div>
          ) : searchActive && !searchLoading && searchCitations.length === 0 && searchAnswer ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">🔍</span>
              <p className="mt-3 text-sm text-[var(--muted)]">未找到精确匹配的记录</p>
            </div>
          ) : !searchActive && records.length > 0 ? (
            <div>
              {records.map((record, idx) => {
                const active = selectedRecord?.id === record.id;
                const dateStr = formatDateOnly(record.createdAt);
                const prevDateStr = idx > 0 ? formatDateOnly(records[idx - 1].createdAt) : null;
                const showDateHeader = dateStr !== prevDateStr;
                return (
                  <div key={record.id}>
                    {showDateHeader && (
                      <div className="sticky top-0 z-[1] bg-[var(--card)]/90 px-1 py-1.5 backdrop-blur-sm">
                        <span className="text-[11px] font-semibold text-[var(--muted)]">{dateStr}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectRecord(record.id)}
                      className={[
                        "relative w-full border-b border-dashed px-3 py-2.5 text-left transition",
                        active
                          ? "border-[var(--line-strong)] bg-[var(--surface-strong)]"
                          : "border-[var(--line)] hover:bg-[var(--surface)]",
                      ].join(" ")}
                    >
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[var(--muted)]">{recordTypeLabels[record.recordType]}</span>
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">
                          {formatTime(record.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[14px] font-semibold leading-snug text-[var(--foreground)]">
                        {record.title}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[12px] leading-relaxed text-[var(--muted)]">
                        {record.summary}
                      </p>
                      {record.keywords.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
                          {record.keywords.slice(0, 3).map((kw) => (
                            <span
                              key={kw}
                              className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted-strong)]"
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
                  </div>
                );
              })}
            </div>
          ) : !searchActive ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">📭</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无资料，先去收录。</p>
            </div>
          ) : null}

          {!searchActive && hasMore && (
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
        <div className="min-h-0 overflow-hidden">
          {selectedRecord ? (
            <RecordPane
              record={selectedRecord}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onOpenDetail={onOpenDetail}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--line)]">
              <p className="text-sm text-[var(--muted)]">选择左侧资料查看详情</p>
            </div>
          )}
        </div>
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
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <span className="text-sm font-medium text-[var(--foreground)]">★ 我的收藏</span>
        <span className="text-xs text-[var(--muted)]">{records.length} 条</span>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <span className="text-3xl">☆</span>
          <p className="mt-3 text-sm text-[var(--muted)]">暂无收藏，在记录详情中点击 ★ 添加收藏。</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)]">
          <div className="hide-scrollbar min-h-0 overflow-y-auto">
            <div>
              {records.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedRecordId(record.id)}
                    className={[
                      "relative w-full border-b border-dashed px-3 py-2.5 text-left transition",
                      active
                        ? "border-[var(--line-strong)] bg-[var(--surface-strong)]"
                        : "border-[var(--line)] hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--muted)]">{recordTypeLabels[record.recordType]}</span>
                      <span className="shrink-0 text-[10px] text-[var(--muted)]">
                        {formatTime(record.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[14px] font-semibold leading-snug text-[var(--foreground)]">
                      {record.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[12px] leading-relaxed text-[var(--muted)]">
                      {record.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
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
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--line)]">
                <p className="text-sm text-[var(--muted)]">选择左侧收藏查看详情</p>
              </div>
            )}
          </div>
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
  const [syncing, setSyncing] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const isSynced = record.syncRuns.some((r) => r.status === "synced");

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

  const handleSync = async (target: "notion" | "ticktick-email") => {
    setSyncing(target);
    setSyncMsg("正在同步...");
    try {
      const res = await fetch(`/api/records/${record.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      setSyncMsg(res.ok ? "同步成功 ✓" : (data.error || "同步失败"));
    } catch {
      setSyncMsg("网络错误");
    } finally {
      setSyncing("");
      setTimeout(() => setSyncMsg(""), 3000);
    }
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
      <div className="hide-scrollbar flex-1 overflow-y-auto px-7 py-6">
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
      <div className="shrink-0 border-t border-[var(--line)] px-6 py-3">
        {syncMsg && <p className="mb-2 text-center text-[12px] text-[var(--muted)]">{syncMsg}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              className={[
                "transition",
                isFav ? "text-amber-400" : "text-[var(--muted)] hover:text-amber-400",
              ].join(" ")}
              title={isFav ? "取消收藏" : "添加收藏"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => handleSync("notion")}
              disabled={!!syncing}
              className={[
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] transition",
                isSynced
                  ? "text-emerald-500"
                  : "text-[var(--muted-strong)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                syncing ? "opacity-50" : "",
              ].join(" ")}
              title={isSynced ? "已同步到 Notion" : "同步到 Notion"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
              </svg>
              {syncing === "notion" ? "同步中..." : isSynced ? "已同步" : "Notion"}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--muted)] transition hover:bg-[var(--surface)]">
                  取消
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-[12px] font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onOpenDetail(record.id)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                  详情
                </button>
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                  编辑
                </button>
                <button type="button" onClick={() => onDelete(record.id)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-rose-500 transition hover:bg-rose-500/10">
                  删除
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
