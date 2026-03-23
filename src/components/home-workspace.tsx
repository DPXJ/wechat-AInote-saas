"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CollapsibleMobileToolbar } from "@/components/collapsible-mobile-toolbar";
import { MobileFullScreenLayer } from "@/components/mobile-full-screen";
import { AssetGallery } from "@/components/asset-gallery";
import { InboxForm } from "@/components/inbox-form";
import { MarkdownEditor } from "@/components/markdown-editor";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { StatsBar } from "@/components/stats-bar";
import { TodoPanel } from "@/components/todo-panel";
import { RecordDetailModal } from "@/components/record-detail-modal";
import { TagManager } from "@/components/tag-manager";
import { SyncIndicator } from "@/components/sync-indicator";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  getPendingRecordsForDisplay,
  getPendingRecordsForSync,
  pendingToRecordLike,
  subscribeSyncStatus,
  syncPendingRecordsToCloud,
} from "@/lib/local-record-store";
import { getPendingTodosForSync, syncPendingTodosToCloud } from "@/lib/local-todo-store";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  RecordType,
  Todo,
  TodoPriority,
} from "@/lib/types";
import { sanitizeSummary } from "@/lib/ai";
import { formatDateTime, formatDateOnly, formatTime } from "@/lib/utils";

type WorkspaceTab = "record" | "history" | "favorites" | "todos" | "tags" | "trash" | "settings";
type HistoryFilter = "all" | "text" | "image" | "video" | "audio" | "document" | "synced";
type DocSubFilter = "" | "pdf" | "word" | "excel" | "md";

const PAGE_SIZE = 20;

type GlobalTone = "info" | "success" | "error";

function TabIcon({ id, className = "w-[18px] h-[18px]" }: { id: string; className?: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (id) {
    case "record": return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "todos": return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 12l2 2 4-4" /></svg>;
    case "history": return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case "favorites": return <svg {...props} fill="none"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" /></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "tags": return <svg {...props}><path d="M4 4h6l10 10-6 6L4 10V4z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "trash": return <svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;
    default: return null;
  }
}

/** 待办数字：无底色，仅红色大字，等宽数字、抗锯齿 */
function PendingTodoCountBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  const text = count > 99 ? "99+" : String(count);
  return (
    <span
      className={[
        "inline-flex shrink-0 items-baseline justify-center text-base font-bold tabular-nums leading-none tracking-tight text-rose-500 antialiased dark:text-rose-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {text}
    </span>
  );
}

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "record", label: "开始记录" },
  { id: "todos", label: "待办" },
  { id: "history", label: "历史" },
  { id: "favorites", label: "收藏" },
  { id: "tags", label: "标签" },
  { id: "trash", label: "回收站" },
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

function RefreshButton({ onClick }: { onClick: () => Promise<void> | void }) {
  const [spinning, setSpinning] = useState(false);
  const handleClick = async () => {
    setSpinning(true);
    try { await onClick(); } finally { setTimeout(() => setSpinning(false), 600); }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={spinning}
      title="刷新"
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
    >
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={spinning ? "animate-spin" : ""}
      >
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
      刷新
    </button>
  );
}

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
  const [historyTagFilter, setHistoryTagFilter] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchAutoOpen, setSearchAutoOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailModalId, setDetailModalId] = useState<string | null>(null);
  const [pendingTodoCount, setPendingTodoCount] = useState(0);
  const [userEmail, setUserEmail] = useState("");
  const [prefetchedTodos, setPrefetchedTodos] = useState<{ todos: Todo[]; total: number } | null>(null);
  const [prefetchedFavorites, setPrefetchedFavorites] = useState<KnowledgeRecord[] | null>(null);
  const [prefetchedTags, setPrefetchedTags] = useState<Array<{ tag: string; count: number }> | null>(null);
  const [prefetchedTrash, setPrefetchedTrash] = useState<Array<KnowledgeRecord & { deletedAt: string }> | null>(null);
  const [localPendingRecords, setLocalPendingRecords] = useState<KnowledgeRecord[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [todosInitialPriority, setTodosInitialPriority] = useState<TodoPriority | "">("");

  const [globalToast, setGlobalToast] = useState<{ status: string; tone: GlobalTone } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("ai-box-global-status");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { status: string; tone?: GlobalTone };
        if (parsed?.status) setGlobalToast({ status: parsed.status, tone: parsed.tone || "info" });
      } catch {
        // ignore
      } finally {
        sessionStorage.removeItem("ai-box-global-status");
      }
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string; tone?: GlobalTone } | undefined;
      const message = detail?.message;
      if (!message) return;
      const tone = (detail?.tone || "info") as GlobalTone;
      setGlobalToast({ status: message, tone });
      try {
        sessionStorage.setItem(
          "ai-box-global-status",
          JSON.stringify({ status: message, tone, ts: Date.now() }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setGlobalToast(null), 4500);
    };

    window.addEventListener("ai-box-global-status", handler as EventListener);
    return () => window.removeEventListener("ai-box-global-status", handler as EventListener);
  }, []);

  useEffect(() => {
    const refreshPending = () => {
      getPendingRecordsForDisplay()
        .then((list) => setLocalPendingRecords(list.map((p) => pendingToRecordLike(p) as unknown as KnowledgeRecord)))
        .catch(() => setLocalPendingRecords([]));
    };
    refreshPending();
    const unsub = subscribeSyncStatus(() => refreshPending());
    return unsub;
  }, []);

  // 页面加载时自动同步本地待同步数据到云端
  useEffect(() => {
    let cancelled = false;
    Promise.all([syncPendingRecordsToCloud(), syncPendingTodosToCloud()]).then(
      ([recordsResult, todosResult]) => {
        if (cancelled) return;
        const synced = (recordsResult?.synced ?? 0) + (todosResult?.synced ?? 0);
        if (synced > 0) router.refresh();
      },
    );
    return () => { cancelled = true; };
  }, [router]);

  // 定时轮询：有待同步数据时每隔一段时间自动尝试同步，避免遗忘手动同步导致数据丢失
  useEffect(() => {
    const INTERVAL_MS = 2 * 60 * 1000;
    const timer = setInterval(async () => {
      const [records, todos] = await Promise.all([
        getPendingRecordsForSync(),
        getPendingTodosForSync(),
      ]);
      if (records.length === 0 && todos.length === 0) return;
      const [recordsResult, todosResult] = await Promise.all([
        syncPendingRecordsToCloud(),
        syncPendingTodosToCloud(),
      ]);
      const synced = (recordsResult?.synced ?? 0) + (todosResult?.synced ?? 0);
      if (synced > 0) router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);


  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      fetch("/api/todos?limit=200", { signal: abort.signal, cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setPrefetchedTodos({ todos: d.todos || [], total: d.total ?? 0 }))
        .catch(() => {}),
      fetch("/api/favorites", { signal: abort.signal })
        .then((r) => r.json())
        .then((d) => setPrefetchedFavorites(d.records || []))
        .catch(() => {}),
      fetch("/api/tags", { signal: abort.signal })
        .then((r) => r.json())
        .then((d) => setPrefetchedTags(d.tags || []))
        .catch(() => {}),
      fetch("/api/records/trash?limit=50", { signal: abort.signal })
        .then((r) => r.json())
        .then((d) => setPrefetchedTrash(d.records || []))
        .catch(() => {}),
    ]);
    return () => abort.abort();
  }, []);

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
    fetch("/api/todos?limit=1&status=pending", { cache: "no-store" })
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

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const setActiveTab = useCallback((tab: WorkspaceTab) => {
    setActiveTabRaw(tab);
    setMobileNavOpen(false);
    window.sessionStorage.setItem("ai-box-tab", tab);
  }, []);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (tabRestoredRef.current) return;
    tabRestoredRef.current = true;
    const saved = window.sessionStorage.getItem("ai-box-tab");
    if (saved && tabs.some((t) => t.id === saved)) {
      setActiveTabRaw(saved as WorkspaceTab);
    } else if (saved) {
      try {
        sessionStorage.removeItem("ai-box-tab");
      } catch {
        /* ignore */
      }
    }
  }, []);

  // 支持 URL 参数：/?tab=history&record=xxx → 跳转历史 tab 并选中该记录（用于「源信息」入口）
  useEffect(() => {
    const tab = searchParams.get("tab");
    const recordId = searchParams.get("record");
    if (tab === "history" && tabs.some((t) => t.id === tab)) {
      setActiveTabRaw("history");
      if (recordId) setSelectedRecordId(recordId);
      router.replace("/", { scroll: false });
    }
  }, [searchParams, router]);

  const refreshRecords = useCallback(async () => {
    const res = await fetch(`/api/records?limit=${records.length || PAGE_SIZE}&offset=0`);
    const data = await res.json();
    setRecords(data.records);
    setTotal(data.total);
  }, [records.length]);

  const loadMoreInFlightRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadMoreInFlightRef.current || loadingMore || records.length >= total) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`/api/records?limit=${PAGE_SIZE}&offset=${records.length}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        setLoadingMore(false);
        return;
      }
      const next = Array.isArray(data.records) ? data.records : [];
      setRecords((prev) => [...prev, ...next]);
      setTotal(typeof data.total === "number" ? data.total : total);
    } catch {
      // 超时或网络错误，避免一直卡在加载中
    } finally {
      setLoadingMore(false);
      loadMoreInFlightRef.current = false;
    }
  }, [loadingMore, records.length, total]);

  /** 乐观删除：先立即从列表移除并关弹窗，再后台请求；失败时刷新列表恢复 */
  const performDelete = useCallback(
    (id: string) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (selectedRecordId === id) setSelectedRecordId("");
      if (detailModalId === id) setDetailModalId(null);
      fetch(`/api/records/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) refreshRecords();
      }).catch(() => refreshRecords());
    },
    [selectedRecordId, detailModalId, refreshRecords],
  );

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  useEffect(() => {
    if (!deleteConfirmId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteConfirmId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteConfirmId]);

  /** 离线优先：先乐观更新 UI，再后台 PATCH；失败时回滚并抛出，由 RecordPane 轻量提示 */
  const handleUpdate = useCallback(
    (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] }) => {
      let prev: KnowledgeRecord | undefined;
      setRecords((p) => {
        prev = p.find((r) => r.id === id);
        const merged = prev ? { ...prev, ...fields } : null;
        return merged ? p.map((r) => (r.id === id ? merged : r)) : p;
      });
      return fetch(`/api/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.record) {
            setRecords((p) => p.map((r) => (r.id === id ? data.record : r)));
          }
          return data.record;
        })
        .catch(() => {
          if (prev) setRecords((p) => p.map((r) => (r.id === id ? prev! : r)));
          throw new Error("保存失败");
        });
    },
    [],
  );

  const handleHistoryFilterChange = useCallback((f: HistoryFilter) => {
    setHistoryFilter(f);
    if (f !== "document") setDocSubFilter("");
  }, []);

  const filteredRecordsBase = useMemo(() => {
    return records.filter((r) => {
      if (historyTagFilter && !(r.keywords || []).includes(historyTagFilter)) return false;
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
  }, [historyFilter, historyTagFilter, docSubFilter, records]);

  const filteredRecords = useMemo(
    () => [...localPendingRecords, ...filteredRecordsBase],
    [localPendingRecords, filteredRecordsBase],
  );

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

      {globalToast && (
        <div
          className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "pointer-events-auto flex animate-toast-in items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-xl backdrop-blur-md",
              globalToast.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/95 text-white dark:bg-emerald-600/95"
                : globalToast.tone === "error"
                  ? "border-rose-500/30 bg-rose-500/95 text-white dark:bg-rose-600/95"
                  : "border-[var(--line-strong)] bg-[var(--card)]/95 text-[var(--foreground)]",
            ].join(" ")}
          >
            {globalToast.tone === "info" && (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {globalToast.tone === "success" && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
            {globalToast.tone === "error" && <span className="shrink-0 text-base leading-none">!</span>}
            <span className="min-w-0 flex-1">{globalToast.status}</span>
            <button
              type="button"
              onClick={() => setGlobalToast(null)}
              className="-mr-1 rounded-lg p-1 opacity-70 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div
        className="relative z-[1] mx-auto grid min-h-screen max-w-[1440px]"
        style={{ gridTemplateColumns: `minmax(0,1fr)` }}
      >
        {/* ── Sidebar (floating) ── */}
        <aside
          className="fixed z-30 hidden lg:block transition-all duration-200"
          style={{ width: sidebarWidth, top: 24, left: 24, bottom: 24 }}
        >
          <div className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--sidebar-bg)] px-5 py-5 shadow-sm">
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
                  onClick={() => {
                    if (tab.id === "todos") setTodosInitialPriority("");
                    setActiveTab(tab.id);
                  }}
                  title={sidebarCollapsed ? tab.label : undefined}
                  className={[
                    "relative flex w-full items-center rounded-xl transition",
                    sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-5 py-2.5 text-left",
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
                        <PendingTodoCountBadge count={pendingTodoCount} />
                      )}
                    </span>
                  )}
                  {sidebarCollapsed && tab.id === "todos" && pendingTodoCount > 0 && (
                    <PendingTodoCountBadge
                      count={pendingTodoCount}
                      className="absolute right-0 top-0 text-sm"
                    />
                  )}
                </button>
              ))}
            </nav>

            {/* Account center */}
            <div className={[
              "mb-2 flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]/50 transition",
              sidebarCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-5 py-2.5",
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
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--background)]/95 px-3 py-2.5 backdrop-blur supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--foreground)] transition hover:bg-[var(--surface)] active:bg-[var(--surface-strong)]"
              aria-label="打开菜单"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-base font-bold text-[var(--foreground)]">AI 信迹</span>
            <div className="flex w-10 shrink-0 items-center justify-end">
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-sm text-[var(--muted)] transition hover:bg-[var(--surface)]"
              >
                {theme === "light" ? "☀" : "☾"}
              </button>
            </div>
          </header>

          {mobileNavOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="主导航">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                  aria-label="关闭菜单"
                  onClick={() => setMobileNavOpen(false)}
                />
                <aside className="absolute bottom-0 left-0 top-0 flex w-[min(88vw,300px)] flex-col border-r border-[var(--line)] bg-[var(--sidebar-bg)] shadow-xl supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
                  <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setMobileNavOpen(false)}
                      className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-sm font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] active:bg-[var(--surface-strong)]"
                    >
                      关闭
                    </button>
                    <span className="min-w-0 flex-1 text-right text-sm font-bold text-[var(--foreground)]">导航</span>
                  </div>
                  <nav className="hide-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          if (tab.id === "todos") setTodosInitialPriority("");
                          setActiveTab(tab.id);
                        }}
                        className={[
                          "relative flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition",
                          activeTab === tab.id
                            ? "bg-[var(--sidebar-active)] font-semibold text-[var(--foreground)]"
                            : "text-[var(--muted-strong)] hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                        ].join(" ")}
                      >
                        <span className="flex w-5 shrink-0 items-center justify-center">
                          <TabIcon id={tab.id} />
                        </span>
                        <span className="flex-1">{tab.label}</span>
                        {tab.id === "todos" && pendingTodoCount > 0 && (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                            {pendingTodoCount > 99 ? "99+" : pendingTodoCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>
                </aside>
              </div>,
              document.body,
            )}

          <div className="flex h-screen flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-6 lg:pb-[24px] lg:pt-[24px]">
            {(activeTab === "record" || activeTab === "history") && (
              <CollapsibleMobileToolbar title="数据概览" className="mb-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatsBar onNavigateToTodos={(priority) => { setTodosInitialPriority(priority ?? ""); setActiveTab("todos"); }} />
                  {activeTab === "history" && <SyncIndicator />}
                </div>
              </CollapsibleMobileToolbar>
            )}

            <div
              className={[
                "content-card flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 shadow-sm backdrop-blur-sm overflow-hidden",
                activeTab !== "todos" && "p-5 lg:p-6",
              ].filter(Boolean).join(" ")}
            >
              {activeTab === "record" && (
                <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium text-[var(--foreground)]">记录信息</h2>
                    <SyncIndicator />
                  </div>
                  <InboxForm
                    onCreated={async (id) => {
                      setSelectedRecordId(id);
                      await refreshRecords();
                      setTimeout(() => refreshRecords(), 5000);
                      setTimeout(() => refreshRecords(), 12000);
                    }}
                    onSwitchToSearch={() => { setActiveTab("history"); setSearchAutoOpen(true); }}
                  />
                </div>
              )}

              {activeTab === "history" && (
                <HistoryTab
                  records={filteredRecords}
                  total={historyTagFilter != null ? filteredRecords.length : total}
                  hasMore={records.length < total}
                  loadingMore={loadingMore}
                  selectedRecord={selectedRecord}
                  historyFilter={historyFilter}
                  docSubFilter={docSubFilter}
                  historyTagFilter={historyTagFilter}
                  onFilterChange={(f) => { setHistoryTagFilter(null); handleHistoryFilterChange(f); }}
                  onDocSubFilterChange={setDocSubFilter}
                  onClearTagFilter={() => setHistoryTagFilter(null)}
                  onSelectRecord={setSelectedRecordId}
                  onLoadMore={loadMore}
                  onDelete={handleDeleteRequest}
                  onUpdate={handleUpdate}
                  onOpenDetail={setDetailModalId}
                  onRefresh={refreshRecords}
                  initialSearchActive={searchAutoOpen}
                  onSearchActiveChange={setSearchAutoOpen}
                />
              )}

              {activeTab === "favorites" && (
                <FavoritesTab
                  initialRecords={prefetchedFavorites}
                  onDelete={handleDeleteRequest}
                  onUpdate={handleUpdate}
                  onOpenDetail={setDetailModalId}
                />
              )}

              {activeTab === "todos" && (
                <div className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:p-6 lg:pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))]">
                  <TodoPanel
                    initialTodos={prefetchedTodos?.todos}
                    initialTotal={prefetchedTodos?.total}
                    initialPriorityFilter={todosInitialPriority}
                    getRecordById={(id) => records.find((r) => r.id === id) ?? null}
                    onGoToRecord={(id) => { setActiveTab("history"); setSelectedRecordId(id); }}
                  />
                </div>
              )}
              {activeTab === "tags" && (
                <TagManager
                  initialTags={prefetchedTags}
                  onTagClick={(tag) => {
                    setHistoryTagFilter(tag);
                    setActiveTab("history");
                  }}
                />
              )}
              {activeTab === "trash" && (
                <TrashTab
                  initialRecords={prefetchedTrash}
                  onRestore={() => { setActiveTab("history"); refreshRecords(); }}
                  onGoToHistory={() => { setActiveTab("history"); }}
                />
              )}
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
          onDelete={handleDeleteRequest}
          onUpdate={handleUpdate}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmId(null);
          }}
        >
          <div
            className="relative mx-4 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-6 text-[15px] leading-relaxed text-[var(--foreground)]">
              确定删除此条记录？记录将移至回收站（30天后自动清理）。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmId;
                  if (!id) return;
                  setDeleteConfirmId(null);
                  performDelete(id);
                }}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ────────────────────────────────────────────────── */
/* History Tab                                         */
/* ────────────────────────────────────────────────── */

const SEARCH_HISTORY_KEY = "ai-box-search-history";
const MAX_SEARCH_HISTORY = 10;

function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveSearchHistory(history: string[]) {
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
}

/** 与 Tailwind `xl`（1280px）一致，用于历史页窄屏主从布局 */
function useMediaQueryMinWidth(minPx: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minPx}px)`);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [minPx]);
  return matches;
}

function HistoryTab({
  records,
  total,
  hasMore,
  loadingMore,
  selectedRecord,
  historyFilter,
  docSubFilter,
  historyTagFilter,
  onFilterChange,
  onDocSubFilterChange,
  onClearTagFilter,
  onSelectRecord,
  onLoadMore,
  onDelete,
  onUpdate,
  onOpenDetail,
  onRefresh,
  initialSearchActive,
  onSearchActiveChange,
}: {
  records: KnowledgeRecord[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  selectedRecord: KnowledgeRecord | null;
  historyFilter: HistoryFilter;
  docSubFilter: DocSubFilter;
  historyTagFilter: string | null;
  onFilterChange: (f: HistoryFilter) => void;
  onDocSubFilterChange: (f: DocSubFilter) => void;
  onClearTagFilter: () => void;
  onSelectRecord: (id: string) => void;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] }) => void;
  onOpenDetail: (id: string) => void;
  onRefresh: () => Promise<void>;
  initialSearchActive?: boolean;
  onSearchActiveChange?: (v: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActiveRaw] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchCitations, setSearchCitations] = useState<Array<{ recordId: string; title: string; snippet: string; sourceLabel: string; score: number; reason?: string }>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
  const isXl = useMediaQueryMinWidth(1280);
  const [mobileHistoryDetailOpen, setMobileHistoryDetailOpen] = useState(false);

  useEffect(() => {
    if (isXl) setMobileHistoryDetailOpen(false);
  }, [isXl]);

  useEffect(() => {
    if (!selectedRecord) setMobileHistoryDetailOpen(false);
  }, [selectedRecord]);

  const setSearchActive = useCallback((v: boolean) => {
    setSearchActiveRaw(v);
    onSearchActiveChange?.(v);
  }, [onSearchActiveChange]);

  useEffect(() => {
    if (initialSearchActive) {
      setSearchActiveRaw(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [initialSearchActive]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    const root = scrollContainerRef.current ?? null;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  const [answerLoading, setAnswerLoading] = useState(false);

  const handleSearch = useCallback(async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    if (!query) return;
    if (!q) setSearchQuery(query);
    setSearchActive(true);
    setSearchLoading(true);
    setSearchAnswer("");
    setSearchCitations([]);
    const updated = [query, ...searchHistory.filter((h) => h !== query)].slice(0, MAX_SEARCH_HISTORY);
    setSearchHistory(updated);
    saveSearchHistory(updated);
    try {
      const citRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, history: [], skipAnswer: true }),
      });
      const citData = await citRes.json();
      const cits = citData.citations || [];
      setSearchCitations(cits);
      setSearchLoading(false);
      if (cits.length > 0) {
        onSelectRecord(cits[0].recordId);
      }

      setAnswerLoading(true);
      try {
        const ansRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, history: [] }),
        });
        const ansData = await ansRes.json();
        setSearchAnswer(ansData.answer || "");
      } finally {
        setAnswerLoading(false);
      }
    } catch {
      setSearchLoading(false);
    }
  }, [searchQuery, searchHistory, onSelectRecord, setSearchActive]);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchAnswer("");
    setSearchCitations([]);
    setMobileHistoryDetailOpen(false);
  }, [setSearchActive]);

  const removeHistoryItem = useCallback((item: string) => {
    const updated = searchHistory.filter((h) => h !== item);
    setSearchHistory(updated);
    saveSearchHistory(updated);
  }, [searchHistory]);

  const clearAllHistory = useCallback(() => {
    setSearchHistory([]);
    saveSearchHistory([]);
  }, []);

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [syncAllError, setSyncAllError] = useState<string>("");

  const syncSingleRecord = useCallback(async (recordId: string) => {
    setSyncingIds((prev) => new Set(prev).add(recordId));
    try {
      const res = await fetch(`/api/records/${recordId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "notion" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setSyncAllError(data.error || "同步失败");
      await onRefresh();
    } finally {
      setSyncingIds((prev) => { const s = new Set(prev); s.delete(recordId); return s; });
    }
  }, [onRefresh]);

  /** 同步全部：仅针对「已存在云端、但未同步到 Notion」的记录，逐条调用 POST /api/records/[id]/sync → Notion。不包含本地待同步（那部分由 SyncIndicator 上传到云端）。 */
  const syncAllUnsynced = useCallback(async () => {
    const unsynced = records.filter(
      (r) => !(r as KnowledgeRecord & { _localPending?: boolean })._localPending &&
        !r.syncRuns.some((run) => run.status === "synced"),
    );
    if (unsynced.length === 0) return;
    setSyncAllRunning(true);
    setSyncAllError("");
    let firstError = "";
    for (const r of unsynced) {
      setSyncingIds((prev) => new Set(prev).add(r.id));
      try {
        const res = await fetch(`/api/records/${r.id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "notion" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && !firstError) firstError = data.error || "同步失败";
      } catch (_e) {
        if (!firstError) firstError = "网络错误";
      }
      setSyncingIds((prev) => { const s = new Set(prev); s.delete(r.id); return s; });
    }
    if (firstError) setSyncAllError(firstError);
    setTimeout(() => setSyncAllError(""), 6000);
    await onRefresh();
    setSyncAllRunning(false);
  }, [records, onRefresh]);

  const unsyncedCount = records.filter(
    (r) => !(r as KnowledgeRecord & { _localPending?: boolean })._localPending &&
      !r.syncRuns.some((run) => run.status === "synced"),
  ).length;

  return (
    <>
    <div className="flex h-full flex-col">
      {/* 窄屏：AI 搜索置顶；类型/同步收入可折叠区；宽屏与原先单行工具栏一致 */}
      <div className="mb-4 flex shrink-0 flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center xl:gap-1.5">
        <div className="order-1 w-full min-w-0 xl:order-2 xl:ml-auto xl:w-auto xl:max-w-xl xl:flex-1">
          {searchActive ? (
            <div className="ai-border flex w-full min-w-0 items-center gap-2 rounded-xl bg-[var(--card)] p-1">
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
                onClick={() => void handleSearch()}
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
              className="ai-border flex w-full items-center gap-2 rounded-lg bg-[var(--card)] px-3 py-2 text-left transition xl:ml-auto xl:w-auto"
            >
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
                <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
              </svg>
              <span className="text-xs text-[var(--muted)]">AI 搜索</span>
            </button>
          )}
        </div>

        {!searchActive && (
          <CollapsibleMobileToolbar title="类型、日期与同步" desktop="xl" className="order-2 min-w-0 w-full xl:order-1 xl:contents">
            <div className="flex flex-wrap items-center gap-1.5">
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

              {historyTagFilter && (
                <span className="flex items-center gap-1 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)]">
                  标签: {historyTagFilter}
                  <button
                    type="button"
                    onClick={onClearTagFilter}
                    className="rounded p-0.5 hover:bg-[var(--surface-strong)]"
                    title="清除标签筛选"
                  >
                    ×
                  </button>
                </span>
              )}
              <span className="text-xs text-[var(--muted)]">{total} 条</span>
              <RefreshButton onClick={onRefresh} />
              {unsyncedCount > 0 && (
                <button
                  type="button"
                  onClick={() => void syncAllUnsynced()}
                  disabled={syncAllRunning}
                  title="将未同步到 Notion 的记录批量同步到 Notion（数据库与 OSS 已保存）"
                  className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
                  </svg>
                  {syncAllRunning ? "同步中..." : `同步到 Notion (${unsyncedCount})`}
                </button>
              )}
              {syncAllError && (
                <span className="max-w-[240px] truncate text-[11px] text-rose-400" title={syncAllError}>
                  {syncAllError}
                </span>
              )}
            </div>
          </CollapsibleMobileToolbar>
        )}
      </div>

      {/* AI answer banner */}
      {searchActive && answerLoading && !searchAnswer && (
        <div className="mb-4 flex shrink-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--foreground)] border-t-transparent" />
          <span className="text-[13px] text-[var(--muted)]">AI 正在生成回答...</span>
        </div>
      )}
      {searchActive && searchAnswer && (
        <div className="mb-4 shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <p className="text-[13px] leading-7 text-[var(--foreground)]">{searchAnswer}</p>
        </div>
      )}

      <div
        className={[
          "min-h-0 flex-1 gap-4 overflow-hidden xl:gap-5",
          searchActive ? "grid" : "flex flex-col xl:grid xl:grid-cols-[360px_minmax(0,1fr)]",
        ].join(" ")}
      >
        {/* Left: independently scrollable list */}
        <div
          ref={scrollContainerRef}
          className={[
            "hide-scrollbar min-h-0 overflow-y-auto",
            !searchActive && !isXl && mobileHistoryDetailOpen ? "hidden" : "",
            !searchActive && !isXl && !mobileHistoryDetailOpen ? "min-h-0 flex-1" : "",
          ].join(" ")}
        >
          {searchActive && !searchLoading && searchCitations.length === 0 && !searchAnswer && searchHistory.length > 0 ? (
            <div className="px-2 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--muted)]">搜索历史</span>
                <button type="button" onClick={clearAllHistory} className="text-[11px] text-[var(--muted)] transition hover:text-[var(--foreground)]">清空</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {searchHistory.map((h) => (
                  <span key={h} className="group flex items-center gap-1 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)]">
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(h); void handleSearch(h); }}
                      className="hover:text-[var(--foreground)]"
                    >
                      {h}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHistoryItem(h)}
                      className="ml-0.5 hidden text-[var(--muted)] hover:text-[var(--foreground)] group-hover:inline"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : searchActive && searchCitations.length > 0 ? (
            <div>
              <p className="px-1 py-1.5 text-[11px] font-medium text-[var(--muted)]">搜索到 {searchCitations.length} 条相关记录</p>
              {searchCitations.map((c) => (
                <button
                  key={c.recordId}
                  type="button"
                  onClick={() => onSelectRecord(c.recordId)}
                  className="relative min-h-[48px] w-full border-b border-dashed border-[var(--line)] px-3 py-3 text-left transition hover:bg-[var(--surface)] active:bg-[var(--surface-strong)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--muted)]">{c.sourceLabel}</span>
                  </div>
                  <p className="mt-1 truncate text-[14px] font-semibold leading-snug text-[var(--foreground)]">{c.title}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted)]">{c.snippet}</p>
                  {c.reason && <p className="mt-1 text-[10px] text-[var(--muted)]">{c.reason}</p>}
                </button>
              ))}
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
                      onClick={() => {
                        onSelectRecord(record.id);
                        if (!isXl) setMobileHistoryDetailOpen(true);
                      }}
                      className={[
                        "relative min-h-[52px] w-full border-b border-dashed px-3 py-3.5 text-left transition",
                        active
                          ? "border-[var(--line-strong)] bg-[var(--surface-strong)]"
                          : "border-[var(--line)] hover:bg-[var(--surface)] active:bg-[var(--surface-strong)]",
                      ].join(" ")}
                    >
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--foreground)]" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[var(--muted)]">
                          {(record as KnowledgeRecord & { _localPending?: boolean })._localPending ? "待同步" : recordTypeLabels[record.recordType]}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">
                          {formatTime(record.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[14px] font-semibold leading-snug text-[var(--foreground)]">
                        {record.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted)] xl:line-clamp-1">
                        {sanitizeSummary(record.summary ?? "")}
                      </p>
                      {record.keywords.length === 0 &&
                        !(record as KnowledgeRecord & { _localPending?: boolean })._localPending &&
                        !record.syncRuns.some((r) => r.status === "synced") && (
                        <div className="mt-1.5 flex justify-end">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); void syncSingleRecord(record.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void syncSingleRecord(record.id); } }}
                            className={["shrink-0 cursor-pointer text-rose-400 transition hover:text-rose-300", syncingIds.has(record.id) ? "animate-pulse" : ""].join(" ")}
                            title="未同步到 Notion，点击同步"
                          >
                            {syncingIds.has(record.id) ? (
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            )}
                          </span>
                        </div>
                      )}
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
                          {!(record as KnowledgeRecord & { _localPending?: boolean })._localPending &&
                            !record.syncRuns.some((r) => r.status === "synced") && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); void syncSingleRecord(record.id); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void syncSingleRecord(record.id); } }}
                              className={["ml-auto shrink-0 cursor-pointer text-rose-400 transition hover:text-rose-300", syncingIds.has(record.id) ? "animate-pulse" : ""].join(" ")}
                              title="未同步到 Notion，点击同步"
                            >
                              {syncingIds.has(record.id) ? (
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              )}
                            </span>
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

        {/* Right: independently scrollable detail pane (hidden during search) */}
        {!searchActive && isXl && (
          <div className="min-h-0 overflow-hidden xl:flex xl:flex-col">
            {selectedRecord ? (
              <div className="h-full min-h-0">
                <RecordPane
                  record={selectedRecord}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  onOpenDetail={onOpenDetail}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--line)]">
                <p className="text-sm text-[var(--muted)]">选择左侧资料查看详情</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <MobileFullScreenLayer
      open={Boolean(!searchActive && !isXl && mobileHistoryDetailOpen && selectedRecord)}
      onClose={() => setMobileHistoryDetailOpen(false)}
      title={selectedRecord?.title ?? "详情"}
    >
      {selectedRecord ? (
        <RecordPane
          record={selectedRecord}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onOpenDetail={onOpenDetail}
        />
      ) : null}
    </MobileFullScreenLayer>
    </>
  );
}

/* ────────────────────────────────────────────────── */
/* Trash Tab (回收站，参考 flomo)                        */
/* ────────────────────────────────────────────────── */

function formatDeletedAt(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return "今天删除";
  if (days === 1) return "昨天删除";
  if (days < 7) return `${days} 天前删除`;
  if (days < 30) return `${Math.floor(days / 7)} 周前删除`;
  return formatDateTime(iso);
}

function TrashTab({
  initialRecords,
  onRestore,
  onGoToHistory,
}: {
  initialRecords?: Array<KnowledgeRecord & { deletedAt: string }> | null;
  onRestore: () => void;
  onGoToHistory: () => void;
}) {
  const hasInitial = initialRecords != null;
  const [records, setRecords] = useState<(KnowledgeRecord & { deletedAt: string })[]>(initialRecords ?? []);
  const [loading, setLoading] = useState(!hasInitial);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [emptyDeleting, setEmptyDeleting] = useState(false);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/records/trash?limit=50");
      const data = await res.json();
      setRecords(data.records || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialRecords != null) {
      setRecords(initialRecords);
      setLoading(false);
      return;
    }
    fetchTrash();
  }, [initialRecords]);

  const handleRestore = useCallback(async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/records/${id}/restore`, { method: "POST" });
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        onRestore();
      }
    } finally {
      setRestoringId(null);
    }
  }, [onRestore]);

  const handlePermanentDeleteRequest = useCallback((id: string) => {
    setDeleteModalId(id);
  }, []);

  /** 确认后立即关闭弹窗，在后台执行永久删除，列表该项显示「删除中...」直到完成 */
  const handleConfirmPermanentDelete = useCallback((id: string) => {
    setDeleteModalId(null);
    setDeletingId(id);
    fetch("/api/records/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hardDelete", ids: [id] }),
    })
      .then((res) => {
        if (res.ok) setRecords((prev) => prev.filter((r) => r.id !== id));
      })
      .finally(() => setDeletingId(null));
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    if (records.length === 0) return;
    setEmptyDeleting(true);
    try {
      const res = await fetch("/api/records/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hardDelete", ids: records.map((r) => r.id) }),
      });
      if (res.ok) {
        setRecords([]);
        onRestore();
      }
    } finally {
      setEmptyDeleting(false);
      setEmptyConfirmOpen(false);
    }
  }, [records, onRestore]);

  if (loading && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <span className="text-sm text-[var(--muted)]">加载中...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--foreground)]">回收站</span>
          <span className="text-xs text-[var(--muted)]">{records.length} 条</span>
        </div>
        {records.length > 0 && (
          <button
            type="button"
            onClick={() => setEmptyConfirmOpen(true)}
            className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface)]"
          >
            清空回收站
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">删除的记录将在此保留约 30 天，之后会自动清理。可恢复或永久删除。</p>

      {records.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
          <span className="text-3xl text-[var(--muted)]">🗑</span>
          <p className="mt-3 text-sm text-[var(--muted)]">回收站为空</p>
          <button
            type="button"
            onClick={onGoToHistory}
            className="mt-2 text-xs text-[var(--muted-strong)] underline hover:no-underline"
          >
            返回历史
          </button>
        </div>
      ) : (
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
          <ul className="space-y-2">
            {records.map((record) => (
              <li
                key={record.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)]/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">{record.title || "未命名"}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{sanitizeSummary(record.summary ?? "")}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {record.deletedAt ? formatDeletedAt(record.deletedAt) : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRestore(record.id)}
                    disabled={restoringId === record.id}
                    className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs text-[var(--foreground)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {restoringId === record.id ? "恢复中..." : "恢复"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePermanentDeleteRequest(record.id)}
                    disabled={deletingId === record.id}
                    className="rounded-lg border border-rose-500/50 px-2.5 py-1.5 text-xs text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {deletingId === record.id ? "删除中..." : "永久删除"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {emptyConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (emptyDeleting) return;
            setEmptyConfirmOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-[var(--foreground)]">确定清空回收站？</p>
            <p className="mt-2 text-xs text-[var(--muted)]">将永久删除当前 {records.length} 条记录，不可恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !emptyDeleting && setEmptyConfirmOpen(false)}
                disabled={emptyDeleting}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleEmptyTrash}
                disabled={emptyDeleting}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {emptyDeleting ? "删除中..." : "清空"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleteModalId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-[var(--foreground)]">确定永久删除该记录？</p>
            <p className="mt-2 text-xs text-[var(--muted)]">删除后不可恢复，将在后台执行。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalId(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleConfirmPermanentDelete(deleteModalId)}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                永久删除
              </button>
            </div>
          </div>
        </div>
      )}
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
  initialRecords,
}: {
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] }) => void;
  onOpenDetail: (id: string) => void;
  initialRecords?: KnowledgeRecord[] | null;
}) {
  const [records, setRecords] = useState<KnowledgeRecord[]>(initialRecords ?? []);
  const hasInitial = initialRecords != null;
  const [loading, setLoading] = useState(!hasInitial);
  const [selectedRecordId, setSelectedRecordId] = useState(initialRecords?.[0]?.id ?? "");
  const isXlFav = useMediaQueryMinWidth(1280);
  const [mobileFavoriteDetailOpen, setMobileFavoriteDetailOpen] = useState(false);

  useEffect(() => {
    if (isXlFav) setMobileFavoriteDetailOpen(false);
  }, [isXlFav]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) || records[0] || null,
    [records, selectedRecordId],
  );

  useEffect(() => {
    if (!selectedRecord) setMobileFavoriteDetailOpen(false);
  }, [selectedRecord]);

  const fetchFavorites = useCallback(async () => {
    if (!hasInitial) setLoading(true);
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
  }, [selectedRecordId, hasInitial]);

  useEffect(() => { fetchFavorites(); }, []);

  const handleUnfavorite = useCallback(async (recordId: string) => {
    await fetch(`/api/favorites/${recordId}`, { method: "DELETE" });
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const handleUpdateFavorite = useCallback(
    (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] }) => {
      let prevRecord: KnowledgeRecord | null = null;
      setRecords((prev) => {
        const r = prev.find((x) => x.id === id);
        if (r) prevRecord = r;
        return prev.map((r) => (r.id === id ? { ...r, ...fields } : r));
      });
      return fetch(`/api/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.record) {
            setRecords((prev) => prev.map((r) => (r.id === id ? data.record : r)));
          }
          return data.record;
        })
        .catch(() => {
          if (prevRecord) {
            setRecords((prev) => prev.map((r) => (r.id === id ? prevRecord! : r)));
          }
          throw new Error("同步失败");
        });
    },
    [],
  );

  if (loading && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-[var(--muted)]">加载中...</span>
      </div>
    );
  }

  return (
    <>
    <div className="flex h-full flex-col">
      <CollapsibleMobileToolbar title="我的收藏" desktop="xl" className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--foreground)]">★ 我的收藏</span>
          <span className="text-xs text-[var(--muted)]">{records.length} 条</span>
        </div>
      </CollapsibleMobileToolbar>

      {records.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <span className="text-3xl">☆</span>
          <p className="mt-3 text-sm text-[var(--muted)]">暂无收藏，在记录详情中点击 ★ 添加收藏。</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden xl:grid xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-5">
          <div
            className={[
              "hide-scrollbar min-h-0 overflow-y-auto",
              !isXlFav && mobileFavoriteDetailOpen ? "hidden" : "",
              !isXlFav && !mobileFavoriteDetailOpen ? "min-h-0 flex-1" : "",
            ].join(" ")}
          >
            <div>
              {records.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(record.id);
                      if (!isXlFav) setMobileFavoriteDetailOpen(true);
                    }}
                    className={[
                      "relative min-h-[52px] w-full border-b border-dashed px-3 py-3.5 text-left transition",
                      active
                        ? "border-[var(--line-strong)] bg-[var(--surface-strong)]"
                        : "border-[var(--line)] hover:bg-[var(--surface)] active:bg-[var(--surface-strong)]",
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
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted)] xl:line-clamp-1">
                      {sanitizeSummary(record.summary ?? "")}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {isXlFav && (
            <div className="min-h-0 overflow-hidden">
              {selectedRecord ? (
                <RecordPane
                  record={selectedRecord}
                  onDelete={onDelete}
                  onUpdate={handleUpdateFavorite}
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
          )}
        </div>
      )}
    </div>

    <MobileFullScreenLayer
      open={Boolean(!isXlFav && mobileFavoriteDetailOpen && selectedRecord)}
      onClose={() => setMobileFavoriteDetailOpen(false)}
      title={selectedRecord?.title ?? "收藏详情"}
    >
      {selectedRecord ? (
        <RecordPane
          record={selectedRecord}
          onDelete={onDelete}
          onUpdate={handleUpdateFavorite}
          onOpenDetail={onOpenDetail}
          favorited
          onToggleFavorite={() => handleUnfavorite(selectedRecord.id)}
        />
      ) : null}
    </MobileFullScreenLayer>
    </>
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
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] }) => void | Promise<unknown>;
  onOpenDetail: (id: string) => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(record.title);
  const [editSource, setEditSource] = useState(record.sourceLabel);
  const [editNote, setEditNote] = useState(record.contextNote);
  const [editContentText, setEditContentText] = useState(record.contentText || record.extractedText || "");
  const [editKeywords, setEditKeywords] = useState<string[]>(record.keywords || []);
  const [editTagInput, setEditTagInput] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isFav, setIsFav] = useState(initialFavorited ?? false);
  const [syncing, setSyncing] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const isSynced = record.syncRuns.some((r) => r.status === "synced");

  useEffect(() => {
    setEditTitle(record.title);
    setEditSource(record.sourceLabel);
    setEditNote(record.contextNote);
    setEditContentText(record.contentText || record.extractedText || "");
    setEditKeywords(record.keywords || []);
  }, [record.id, record.title, record.sourceLabel, record.contextNote, record.contentText, record.extractedText, record.keywords]);

  useEffect(() => {
    if (editModalOpen) {
      setEditTitle(record.title);
      setEditSource(record.sourceLabel);
      setEditNote(record.contextNote);
      setEditContentText(record.contentText || record.extractedText || "");
      setEditKeywords(record.keywords || []);
    }
  }, [editModalOpen, record.id, record.title, record.sourceLabel, record.contextNote, record.contentText, record.extractedText, record.keywords]);

  useEffect(() => {
    if (!editModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editModalOpen]);

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

  const handleSave = () => {
    const fields: Record<string, string | string[]> = {};
    if (editTitle !== record.title) fields.title = editTitle;
    if (editSource !== record.sourceLabel) fields.sourceLabel = editSource;
    if (editNote !== record.contextNote) fields.contextNote = editNote;
    const origText = record.contentText || record.extractedText || "";
    if (editContentText !== origText) fields.contentText = editContentText;
    const origKw = record.keywords || [];
    if (JSON.stringify([...editKeywords].sort()) !== JSON.stringify([...origKw].sort())) fields.keywords = editKeywords;
    if (Object.keys(fields).length === 0) {
      setEditModalOpen(false);
      return;
    }
    setSaveError("");
    setEditModalOpen(false);
    const result = onUpdate(record.id, fields as { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string; keywords?: string[] });
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch(() => {
        setSaveError("同步失败，将自动重试");
        setTimeout(() => setSaveError(""), 4000);
      });
    }
  };

  const addTagFromInput = () => {
    const raw = editTagInput.trim().split(/[\s,，]+/).filter(Boolean);
    const added = raw.filter((t) => !editKeywords.includes(t));
    if (added.length > 0) {
      setEditKeywords((prev) => [...prev, ...added].slice(0, 20));
      setEditTagInput("");
    }
  };

  const removeEditTag = (kw: string) => {
    setEditKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const isFlomoSynced = record.syncRuns.some((r) => r.target === "flomo" && r.status === "synced");

  const handleSync = async (target: "notion" | "ticktick-email" | "flomo") => {
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

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = record.contentText || record.summary;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [record.contentText, record.summary]);

  useEffect(() => { setCopied(false); }, [record.id]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] max-xl:rounded-xl">
      {/* Scrollable content */}
      <div className="hide-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--muted)] sm:text-[13px]">
          <span>{record.sourceLabel}</span>
          <span className="text-[var(--line-strong)]">·</span>
          <span>{recordTypeLabels[record.recordType]}</span>
          <span className="text-[var(--line-strong)]">·</span>
          <span>{formatDateTime(record.createdAt)}</span>
        </div>

        <h2 className="mt-3 text-lg font-bold leading-snug text-[var(--foreground)] sm:text-xl">
          {record.title}
        </h2>

        {/* AI 摘要 / 摘要 */}
        {record.summary && (
          <div className="mt-3 rounded-lg bg-[var(--surface)] px-3.5 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {record.summary === (record.contentText || record.extractedText || "").trim()
                ? "摘要（原文，未启用 AI）"
                : "AI 摘要"}
            </p>
            <p className="text-[13px] leading-6 text-[var(--muted-strong)] whitespace-pre-line">
              {sanitizeSummary(record.summary)}
            </p>
            {record.summary === (record.contentText || record.extractedText || "").trim() && (
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                在 设置 → AI 摘要 中配置 OpenAI 可启用智能标题与摘要生成。
              </p>
            )}
          </div>
        )}

        <div className="my-5 border-t border-dashed border-[var(--line)]" />

        {/* 文本内容（只读；编辑请点「编辑」打开大弹窗） */}
        {(record.contentText || record.extractedText) && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">文本内容</p>
            <div className="prose-custom pr-1 text-[14px] leading-7 text-[var(--foreground)] sm:pr-2 sm:text-[15px] sm:leading-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{record.contentText || record.extractedText}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* 附件（图片等）：图片卡内已含描述与 OCR，视觉上与图片同区 */}
        {record.assets.length > 0 && (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <AssetGallery assets={record.assets} useThumbnails />
          </>
        )}

        {/* Manual tags */}
        {record.keywords.length > 0 && (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">标签</p>
              <div className="flex flex-wrap gap-2">
                {record.keywords.map((kw) => (
                  <span key={kw} className="rounded-md bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted-strong)]">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {record.contextNote ? (
          <>
            <div className="my-5 border-t border-dashed border-[var(--line)]" />
            <div className="rounded-xl bg-[var(--surface)] px-4 py-3.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">备注</p>
              <p className="text-sm leading-7 text-[var(--muted-strong)]">{record.contextNote}</p>
            </div>
          </>
        ) : null}
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 border-t border-[var(--line)] px-3 pt-3 sm:px-6 sm:pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
              {syncing === "notion" ? "同步中..." : "Notion"}
            </button>

            <button
              type="button"
              onClick={() => handleSync("flomo")}
              disabled={!!syncing}
              className={[
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] transition",
                isFlomoSynced
                  ? "text-emerald-500"
                  : "text-[var(--muted-strong)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                syncing ? "opacity-50" : "",
              ].join(" ")}
              title={isFlomoSynced ? "已同步到 flomo" : "同步到 flomo"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l-7-5V8l7 5v6z" /><path d="M12 13l7-5v6l-7 5v-6z" /><path d="M5 8l7-5 7 5-7 5-7-5z" />
              </svg>
              {syncing === "flomo" ? "同步中..." : "flomo"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {saveError && (
              <span className="text-[12px] text-rose-500">{saveError}</span>
            )}
            {(record.contentText || record.extractedText) && (
              <button
                type="button"
                onClick={handleCopy}
                className={[
                  "rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition",
                  copied
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {copied ? "已复制" : "复制"}
              </button>
            )}
            {(record as KnowledgeRecord & { _localPending?: boolean })._localPending ? (
              <span className="rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--muted)]">待同步</span>
            ) : (
              <button type="button" onClick={() => onOpenDetail(record.id)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                详情
              </button>
            )}
            {(record as KnowledgeRecord & { _localPending?: boolean })._localPending ? null : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(record.title);
                    setEditSource(record.sourceLabel);
                    setEditNote(record.contextNote);
                    setEditContentText(record.contentText || record.extractedText || "");
                    setEditKeywords(record.keywords || []);
                    setEditModalOpen(true);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                >
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

      {/* 编辑大弹窗：标题、文本内容、标签、备注、来源（来源置底） */}
      {editModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditModalOpen(false); }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-[var(--line)] px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[var(--foreground)]">编辑记录</h3>
                <button type="button" onClick={() => setEditModalOpen(false)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">标题</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                  placeholder="标题"
                />
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">文本内容（支持 Markdown）</label>
                <MarkdownEditor
                  key={record.id}
                  value={editContentText}
                  onChange={setEditContentText}
                  placeholder="输入文本或 Markdown，支持直接粘贴截图…"
                  minHeight="min-h-[36vh]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">标签</label>
                <div className="flex flex-wrap items-center gap-2">
                  {editKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--surface)] pl-2.5 pr-1 py-1 text-xs font-medium text-[var(--muted-strong)]"
                    >
                      {kw}
                      <button type="button" onClick={() => removeEditTag(kw)} className="rounded p-0.5 hover:bg-[var(--line)]">×</button>
                    </span>
                  ))}
                  <input
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTagFromInput(); } }}
                    placeholder="添加标签（空格或逗号分隔）"
                    className="min-w-[120px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
                  />
                  {editTagInput.trim() && (
                    <button type="button" onClick={addTagFromInput} className="rounded-md bg-[var(--foreground)] px-2 py-0.5 text-xs text-[var(--background)]">添加</button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">备注（可选）</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  placeholder="备注信息"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">来源</label>
                <input
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                  placeholder="来源"
                />
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
              {saveError && <span className="mr-2 text-xs text-rose-500">{saveError}</span>}
              <button type="button" onClick={() => setEditModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface)]">
                取消
              </button>
              <button type="button" onClick={handleSave} className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90">
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
