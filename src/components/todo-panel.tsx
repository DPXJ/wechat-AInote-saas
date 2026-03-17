"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";
import {
  addPendingTodo,
  getAllPendingTodos,
  type PendingTodo,
  type PendingTodoPayload,
  syncPendingTodosToCloud,
} from "@/lib/local-todo-store";

type TodoFilter = "all" | "pending" | "done" | "deleted";
type DateRangeFilter = "" | "today" | "last7";

const priorityConfig: Record<TodoPriority, { label: string; dot: string; bg: string }> = {
  urgent: { label: "紧急", dot: "bg-rose-500", bg: "bg-rose-500/10 text-rose-600" },
  high: { label: "高", dot: "bg-orange-500", bg: "bg-orange-500/10 text-orange-600" },
  medium: { label: "中", dot: "bg-blue-500", bg: "bg-blue-500/10 text-blue-600" },
  low: { label: "低", dot: "bg-gray-400", bg: "bg-gray-400/10 text-gray-500" },
};

const priorities: TodoPriority[] = ["urgent", "high", "medium", "low"];

const TIME_PATTERNS = [
  /(\d{1,2}[:\uff1a]\d{2})/,
  /((?:\u4e0a\u5348|\u4e0b\u5348|\u665a\u4e0a|\u65e9\u4e0a|\u51cc\u6668|\u4e2d\u5348|\u508d\u665a)\s*\d{1,2}\s*(?:\u70b9\u534a|\u70b9\u949f|\u70b9|\u65f6)(?:\s*(?:\u534a|\u6574|\d{1,2}\u5206))?)/,
  /(\d{1,2}\s*(?:\u70b9\u534a|\u70b9\u949f|\u70b9|\u65f6)(?:\s*(?:\u534a|\u6574|\d{1,2}\u5206))?)/,
  /(\u660e\u5929|\u540e\u5929|\u4eca\u5929|\u4eca\u665a|\u4eca\u65e9|\u672c\u5468|\u4e0b\u5468|\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]|\u661f\u671f[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/,
  /(\d{1,2}\u6708\d{1,2}[\u65e5\u53f7])/,
];

function extractTimeHint(text: string): string | null {
  for (const pattern of TIME_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return null;
}

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

function groupByDate(todos: Todo[]): Array<{ dateKey: string; label: string; items: Todo[] }> {
  const map = new Map<string, Todo[]>();
  for (const t of todos) {
    const key = getDateKey(t.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ dateKey: key, label: formatDateLabel(items[0].createdAt), items }));
}

export function TodoPanel({
  initialTodos,
  initialTotal,
  initialPriorityFilter,
}: {
  initialTodos?: Todo[];
  initialTotal?: number;
  initialPriorityFilter?: TodoPriority | "";
} = {}) {
  const [serverTodos, setServerTodos] = useState<Todo[]>(initialTodos ?? []);
  const [localTodos, setLocalTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [filter, setFilter] = useState<TodoFilter>("pending");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("");
  const [priorityFilter, setPriorityFilter] = useState<TodoPriority | "">(initialPriorityFilter ?? "");
  const [dateFilter, setDateFilter] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPriority, setNewPriority] = useState<TodoPriority>("medium");
  const [creating, setCreating] = useState(false);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [batchSyncing, setBatchSyncing] = useState(false);

  const loadLocalTodos = useCallback(async () => {
    try {
      const pending: PendingTodo[] = await getAllPendingTodos();
      const mapped: Todo[] = pending.map((t) => ({
        id: t.localId,
        recordId: null,
        content: t.payload.content,
        priority: t.payload.priority,
        status: t.payload.status,
        createdAt: t.createdAt,
        completedAt: null,
        updatedAt: t.createdAt,
        deletedAt: null,
        syncedAt: null,
      }));
      setLocalTodos(mapped);
    } catch {
      setLocalTodos([]);
    }
  }, []);

  const fetchInFlightRef = useRef(false);
  const fetchTodos = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`/api/todos?limit=200`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        setServerTodos([]);
        setTotal(0);
        return;
      }
      setServerTodos(Array.isArray(data.todos) ? data.todos : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setServerTodos([]);
      setTotal(0);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadLocalTodos();
    void fetchTodos();
    const timer = window.setInterval(() => { void fetchTodos(); }, 30000);
    const onFocus = () => { void fetchTodos(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchTodos, loadLocalTodos]);

  const handleCreate = async () => {
    if (!newContent.trim() || creating) return;
    setCreating(true);
    try {
      const payload: PendingTodoPayload = {
        content: newContent.trim(),
        priority: newPriority,
        status: "pending",
      };
      const pending = await addPendingTodo(payload);
      setLocalTodos((curr) => [
        ...curr,
        {
          id: pending.localId,
          recordId: null,
          content: pending.payload.content,
          priority: pending.payload.priority,
          status: pending.payload.status,
          createdAt: pending.createdAt,
          completedAt: null,
          updatedAt: pending.createdAt,
          deletedAt: null,
          syncedAt: null,
        },
      ]);
      setNewContent("");
      setNewPriority("medium");
      setFilter("pending");
      setDateFilter("");
      void syncPendingTodosToCloud().then(() => {
        void loadLocalTodos();
        void fetchTodos();
      });
    } finally { setCreating(false); }
  };

  const toggleStatus = async (todo: Todo) => {
    if (todo.id.startsWith("local_todo_")) return;
    const newStatus: TodoStatus = todo.status === "pending" ? "done" : "pending";
    if (newStatus === "done") {
      setCompletingIds((s) => new Set(s).add(todo.id));
      await new Promise((r) => setTimeout(r, 280));
    }
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      cache: "no-store",
    });
    await fetchTodos();
    setCompletingIds((s) => {
      const next = new Set(s);
      next.delete(todo.id);
      return next;
    });
  };

  const updatePriority = async (todo: Todo, priority: TodoPriority) => {
    if (todo.id.startsWith("local_todo_")) return;
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
      cache: "no-store",
    });
    await fetchTodos();
  };

  const handleSoftDelete = async (id: string) => {
    if (id.startsWith("local_todo_")) {
      setLocalTodos((curr) => curr.filter((t) => t.id !== id));
      return;
    }
    await fetch(`/api/todos/${id}`, { method: "DELETE", cache: "no-store" });
    await fetchTodos();
  };

  const handleHardDelete = async (id: string) => {
    if (!window.confirm("确定彻底删除？此操作不可恢复。")) return;
    if (id.startsWith("local_todo_")) {
      setLocalTodos((curr) => curr.filter((t) => t.id !== id));
      return;
    }
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _hardDelete: true }),
      cache: "no-store",
    });
    await fetchTodos();
  };

  const handleRestore = async (id: string) => {
    if (id.startsWith("local_todo_")) return;
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
      cache: "no-store",
    });
    await fetchTodos();
  };

  const allTodos = useMemo(() => [...localTodos, ...serverTodos], [localTodos, serverTodos]);

  const filteredTodos = useMemo(() => {
    let base = allTodos;
    if (filter !== "all") {
      base = base.filter((t) => t.status === filter);
    }
    if (dateRangeFilter === "today") {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      base = base.filter((t) => getDateKey(t.createdAt) === todayStr);
    } else if (dateRangeFilter === "last7") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      base = base.filter((t) => new Date(t.createdAt) >= cutoff);
    } else if (dateFilter) {
      base = base.filter((t) => getDateKey(t.createdAt) === dateFilter);
    }
    if (priorityFilter) {
      base = base.filter((t) => t.priority === priorityFilter);
    }
    return base;
  }, [allTodos, filter, dateRangeFilter, dateFilter, priorityFilter]);

  const displayTodos = useMemo(() => {
    const base = [...filteredTodos];
    for (const id of completingIds) {
      const t = allTodos.find((x) => x.id === id);
      if (t && !base.some((x) => x.id === id)) base.push(t);
    }
    return base;
  }, [filteredTodos, allTodos, completingIds]);

  const groups = useMemo(() => groupByDate(displayTodos), [displayTodos]);

  const todosNeedingSync = useMemo(() => {
    return displayTodos.filter(
      (t) =>
        !t.id.startsWith("local_todo_") &&
        (!t.syncedAt || (t.updatedAt && t.syncedAt && t.updatedAt > t.syncedAt)),
    );
  }, [displayTodos]);

  const handleBatchSync = useCallback(async () => {
    if (todosNeedingSync.length === 0) return;
    setBatchSyncing(true);
    try {
      const res = await fetch("/api/todos/sync-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: todosNeedingSync.map((t) => t.id) }),
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        fetchTodos();
      }
    } finally {
      setBatchSyncing(false);
    }
  }, [todosNeedingSync, fetchTodos]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTodos) set.add(getDateKey(t.createdAt));
    return Array.from(set).sort().reverse();
  }, [allTodos]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fixed header: title + create + filters */}
      <div className="shrink-0 space-y-4">
        <h2 className="text-xl font-bold text-[var(--foreground)]">待办事项</h2>

        {/* Quick create */}
        <div className="flex items-center gap-2">
          <div className="input-focus-bar flex-1">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="添加新待办..."
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--foreground)] focus:outline-none"
            />
          </div>
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)]"
          >
            {priorities.map((p) => (
              <option key={p} value={p}>{priorityConfig[p].label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newContent.trim()}
            className="rounded-xl bg-[var(--foreground)] px-4 py-2.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
          >
            添加
          </button>
        </div>

        {/* Filter tabs + date filter */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "all", label: "全部" },
            { id: "pending", label: "待处理" },
            { id: "done", label: "已完成" },
            { id: "deleted", label: "已删除" },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                filter === f.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}

          {/* 日期范围 + 优先级筛选（与状态 tab 为并关系） */}
          {([
            { id: "today", label: "今日" },
            { id: "last7", label: "近七日" },
          ] as const).map((f) => (
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
          {priorities.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter((v) => (v === p ? "" : p))}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                priorityFilter === p
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {priorityConfig[p].label}
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
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <span className="text-xs text-[var(--muted)] ml-1">{filteredTodos.length} 条</span>

          {todosNeedingSync.length > 0 && (
            <button
              type="button"
              onClick={handleBatchSync}
              disabled={batchSyncing}
              className="ml-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-strong)] disabled:opacity-50"
            >
              {batchSyncing ? "同步中..." : `批量同步滴答 (${todosNeedingSync.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Todo list (scroll handled by parent content-card when todos tab) */}
      <div className="mt-4">
        <div className="mx-auto max-w-4xl space-y-4 pb-24">
          {filteredTodos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">☑</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无待办事项</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.dateKey}>
                {/* Date divider */}
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--muted)]">{group.label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{group.dateKey}</span>
                  <div className="h-px flex-1 bg-[var(--line)]" />
                </div>

                <div className="space-y-4">
                  {group.items.map((todo) => {
                    const completing = completingIds.has(todo.id);
                    return (
                      <div
                        key={todo.id}
                        className="overflow-hidden transition-all duration-300 ease-out"
                        style={
                          completing
                            ? { maxHeight: 0, opacity: 0, marginTop: 0, marginBottom: 0 }
                            : { maxHeight: 500, opacity: 1 }
                        }
                      >
                        <TodoCard
                          todo={todo}
                          completing={completing}
                          onToggleStatus={() => toggleStatus(todo)}
                          onChangePriority={(p) => updatePriority(todo, p)}
                          onSoftDelete={() => handleSoftDelete(todo.id)}
                          onHardDelete={() => handleHardDelete(todo.id)}
                          onRestore={() => handleRestore(todo.id)}
                          onOpenDetail={() => setDetailTodo(todo)}
                          onSynced={fetchTodos}
                          onSetTime={fetchTodos}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail modal — 使用 Portal 渲染到 body，避免父级 overflow 裁剪遮罩 */}
      {detailTodo &&
        typeof document !== "undefined" &&
        createPortal(
          <TodoDetailModal
            todo={detailTodo}
            onClose={() => setDetailTodo(null)}
            onRefresh={() => { setDetailTodo(null); fetchTodos(); }}
          />,
          document.body
        )}
    </div>
  );
}

/* ── Todo Card ── */

const TIME_PREFIX_REGEX = /^(\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\s*)/;

function formatTimePrefix(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return `${y}年${m}月${d}日 ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function TodoCard({
  todo,
  completing,
  onToggleStatus,
  onChangePriority,
  onSoftDelete,
  onHardDelete,
  onRestore,
  onOpenDetail,
  onSynced,
  onSetTime,
}: {
  todo: Todo;
  completing?: boolean;
  onToggleStatus: () => void;
  onChangePriority: (priority: TodoPriority) => void;
  onSoftDelete: () => void;
  onHardDelete: () => void;
  onRestore: () => void;
  onOpenDetail: () => void;
  onSynced: () => void;
  onSetTime?: () => void;
}) {
  const pc = priorityConfig[todo.priority];
  const isDeleted = todo.status === "deleted";
  const timeHint = extractTimeHint(todo.content);
  const needsResync = todo.syncedAt && todo.updatedAt > todo.syncedAt;
  const [priorityOpen, setPriorityOpen] = useState(false);

  return (
    <div
      className={[
        "group/card rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 transition-all duration-300 ease-out will-change-transform",
        isDeleted ? "opacity-50" : "hover:border-[var(--line-strong)] hover:shadow-sm cursor-pointer",
        todo.status === "done" && !isDeleted ? "opacity-60" : "",
        completing ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100",
      ].join(" ")}
      onClick={() => !isDeleted && !completing && onOpenDetail()}
    >
      {/* 左侧固定宽度使虚线对齐；右侧操作区 */}
      <div className="grid grid-cols-[minmax(0,1fr)_220px] items-stretch gap-0">
        {/* 左侧小卡片：勾选 + 内容（最多 3 行）+ 时间，宽度自适应但虚线由右侧列起点固定 */}
        <div className="flex min-w-0 items-start gap-3 border-r border-dashed border-[var(--line)] pr-4">
          {!isDeleted && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleStatus(); }}
              className={[
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ease-out active:scale-95",
                todo.status === "done"
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--line-strong)] hover:border-[var(--foreground)] hover:bg-[var(--surface)]",
              ].join(" ")}
            >
              {todo.status === "done" && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p
              className={[
                "text-sm font-medium leading-snug line-clamp-3 break-words",
                todo.status === "done" ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]",
              ].join(" ")}
            >
              {todo.content}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
              {timeHint && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
                  🕐 {timeHint}
                </span>
              )}
              <span>{formatBeijingTime(todo.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* 右侧小卡片：默认显示优先级（靠左）+ 已同步绿点；悬浮依次显示：同步滴答、来源、删除 */}
        <div className="flex min-w-[220px] flex-nowrap items-center justify-start gap-2 pl-4" onClick={(e) => e.stopPropagation()}>
          {!isDeleted && (
            <>
              {/* 优先级：始终显示，靠左 */}
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPriorityOpen((v) => !v); }}
                  title={`优先级: ${pc.label}`}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${pc.bg}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {pc.label}
                </button>
                {/* 已同步滴答：小绿点 + 文字 */}
                {todo.syncedAt && !needsResync && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-500" title="已同步至滴答清单">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    已同步滴答
                  </span>
                )}
                {priorityOpen && (
                  <div
                    className="absolute left-0 top-full z-20 mt-1 w-28 rounded-lg border border-[var(--line)] bg-[var(--card)] p-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {priorities.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { onChangePriority(p); setPriorityOpen(false); }}
                        className={[
                          "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] transition",
                          todo.priority === p
                            ? priorityConfig[p].bg
                            : "text-[var(--muted-strong)] hover:bg-[var(--surface)]",
                        ].join(" ")}
                      >
                        <span>{priorityConfig[p].label}</span>
                        {todo.priority === p && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 悬浮时显示：设定时间、同步/重同步按钮、删除 */}
              <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
                {onSetTime && (
                  <TodoTimePicker
                    todoId={todo.id}
                    content={todo.content}
                    disabled={todo.id.startsWith("local_todo_")}
                    onUpdated={onSetTime}
                  />
                )}
                {todo.syncedAt && !needsResync ? null : needsResync ? (
                  <SyncTickTickBtn todoId={todo.id} onSynced={onSynced} label="重同步" disabled={todo.id.startsWith("local_todo_")} />
                ) : (
                  <SyncTickTickBtn todoId={todo.id} onSynced={onSynced} label="同步滴答" disabled={todo.id.startsWith("local_todo_")} />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSoftDelete(); }}
                  className="rounded-md p-1 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500"
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </>
          )}

          {isDeleted && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRestore}
                className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface)]"
              >
                恢复
              </button>
              <button
                type="button"
                onClick={onHardDelete}
                className="rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-500/10"
              >
                彻底删除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Todo Detail Modal ── */

function TodoDetailModal({
  todo,
  onClose,
  onRefresh,
}: {
  todo: Todo;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editContent, setEditContent] = useState(todo.content);
  const [editPriority, setEditPriority] = useState<TodoPriority>(todo.priority);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [sourceRecord, setSourceRecord] = useState<{ title: string; summary?: string; sourceLabel?: string } | null | "loading">(todo.recordId ? "loading" : null);

  useEffect(() => {
    if (!todo.recordId) return;
    fetch(`/api/records/${todo.recordId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.record) {
          setSourceRecord({
            title: data.record.title || "未命名",
            summary: data.record.summary,
            sourceLabel: data.record.sourceLabel,
          });
        } else {
          setSourceRecord(null);
        }
      })
      .catch(() => setSourceRecord(null));
  }, [todo.recordId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent, priority: editPriority }),
      cache: "no-store",
    });
    setSaving(false);
    onRefresh();
  };

  const handleSync = async () => {
    setSyncing(true);
    setMsg("");
    try {
      const res = await fetch(`/api/todos/${todo.id}/sync`, { method: "POST", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "同步失败"); }
      else { setMsg("已同步到滴答清单 ✓"); }
    } catch { setMsg("同步请求失败"); }
    finally { setSyncing(false); }
  };

  const needsResync = todo.syncedAt && todo.updatedAt > todo.syncedAt;
  type DetailTab = "basic" | "source" | "sync";
  const [activeTab, setActiveTab] = useState<DetailTab>("basic");

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "basic", label: "基本信息" },
    { id: "source", label: "来源" },
    { id: "sync", label: "同步" },
  ];

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--background)] shadow-2xl">
        {/* 标题栏：待办详情 + 源信息按钮 + 关闭 */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <h3 className="text-lg font-bold text-[var(--foreground)]">待办详情</h3>
          <div className="flex items-center gap-2">
            {todo.recordId && (
              <Link
                href={`/?tab=history&record=${todo.recordId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-purple-500 transition hover:bg-purple-500/10"
              >
                源信息
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M17 7h-10v10" />
                </svg>
              </Link>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
              ✕
            </button>
          </div>
        </div>

        {/* 选项卡 */}
        <div className="flex shrink-0 gap-1 border-b border-[var(--line)] px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                "border-b-2 px-4 py-3 text-sm font-medium transition",
                activeTab === t.id
                  ? "border-[var(--foreground)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区：可滚动 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "basic" && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-[var(--muted)]">内容</span>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--muted)]">优先级</span>
                <div className="flex gap-1">
                  {priorities.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditPriority(p)}
                      className={[
                        "rounded-md px-2 py-0.5 text-xs font-medium transition",
                        editPriority === p ? priorityConfig[p].bg : "bg-[var(--surface)] text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {priorityConfig[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                <div>状态：<span className="text-[var(--foreground)]">{todo.status === "pending" ? "待处理" : todo.status === "done" ? "已完成" : "已删除"}</span></div>
                <div>创建时间：<span className="text-[var(--foreground)]">{formatBeijingTime(todo.createdAt)}</span></div>
              </div>
            </div>
          )}

          {activeTab === "source" && todo.recordId && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
              {sourceRecord === "loading" ? (
                <p className="text-sm text-[var(--muted)]">加载中...</p>
              ) : sourceRecord ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{sourceRecord.title}</p>
                  {sourceRecord.summary && (
                    <p className="text-sm leading-6 text-[var(--muted-strong)]">{sourceRecord.summary}</p>
                  )}
                  {sourceRecord.sourceLabel && (
                    <p className="text-xs text-[var(--muted)]">来源：{sourceRecord.sourceLabel}</p>
                  )}
                  <p className="pt-2 text-xs text-[var(--muted)]">
                    点击顶部「源信息」可跳转至完整记录页面查看详情。
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">无法加载来源信息</p>
              )}
            </div>
          )}

          {activeTab === "source" && !todo.recordId && (
            <p className="text-sm text-[var(--muted)]">此待办无关联来源记录</p>
          )}

          {activeTab === "sync" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">同步到滴答清单</p>
                  {todo.syncedAt ? (
                    <p className="mt-0.5 text-xs text-emerald-500">已同步 · {formatBeijingTime(todo.syncedAt)}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">尚未同步</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card)] disabled:opacity-50"
                >
                  {syncing ? "同步中..." : (todo.syncedAt || needsResync) ? "重新同步" : "同步"}
                </button>
              </div>
              {msg && (
                <p className={["rounded-lg px-3 py-2 text-xs", msg.includes("失败") ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"].join(" ")}>
                  {msg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)]">
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Todo Time Picker ── */

function TodoTimePicker({
  todoId,
  content,
  disabled,
  onUpdated,
}: {
  todoId: string;
  content: string;
  disabled?: boolean;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const getDefaultValues = () => {
    const d = new Date();
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
  };
  const [dateVal, setDateVal] = useState(getDefaultValues().date);
  const [timeVal, setTimeVal] = useState(getDefaultValues().time);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const def = getDefaultValues();
      setDateVal(def.date);
      setTimeVal(def.time);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || saving) return;
    setSaving(true);
    try {
      const prefix = formatTimePrefix(dateVal, timeVal);
      const newContent = content.match(TIME_PREFIX_REGEX)
        ? content.replace(TIME_PREFIX_REGEX, `${prefix} `).trim()
        : `${prefix} ${content}`.trim();
      const res = await fetch(`/api/todos/${todoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
        cache: "no-store",
      });
      if (res.ok) {
        setOpen(false);
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(true); }}
        disabled={disabled}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
        title="设定时间"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <div
              className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-bold text-[var(--foreground)]">设定提醒时间</h3>
              <p className="mb-3 text-xs text-[var(--muted)]">输入日期和时刻，将自动添加到待办内容开头，便于同步到滴答清单</p>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
                <input
                  type="time"
                  value={timeVal}
                  onChange={(e) => setTimeVal(e.target.value)}
                  step="60"
                  className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "确定"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/* ── Inline Sync Button ── */

function SyncTickTickBtn({ todoId, onSynced, label, disabled }: { todoId: string; onSynced: () => void; label: string; disabled?: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setSyncing(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/todos/${todoId}/sync`, { method: "POST", cache: "no-store" });
      if (res.ok) {
        onSynced();
      } else {
        const data = await res.json().catch(() => ({ error: "同步失败" }));
        setErrMsg(data.error || "同步失败");
        setTimeout(() => setErrMsg(""), 4000);
      }
    } catch {
      setErrMsg("网络错误");
      setTimeout(() => setErrMsg(""), 4000);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing || disabled}
        className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-purple-500 transition hover:bg-purple-500/10 disabled:opacity-50"
      >
        <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8a6 6 0 0 1 10.3-4.1M14 8a6 6 0 0 1-10.3 4.1" />
          <path d="M14 2v4h-4M2 14v-4h4" />
        </svg>
        {syncing ? "..." : disabled ? "先保存" : label}
      </button>
      {errMsg && <span className="text-[9px] text-rose-500">{errMsg}</span>}
    </span>
  );
}
