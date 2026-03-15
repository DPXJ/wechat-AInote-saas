"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

type TodoFilter = "all" | "pending" | "done" | "deleted";

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

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<TodoFilter>("pending");
  const [dateFilter, setDateFilter] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPriority, setNewPriority] = useState<TodoPriority>("medium");
  const [creating, setCreating] = useState(false);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);

  const fetchTodos = useCallback(async () => {
    const res = await fetch(`/api/todos?limit=200`);
    const data = await res.json();
    setTodos(data.todos);
    setTotal(data.total);
  }, []);

  useEffect(() => {
    void fetchTodos();
    const timer = window.setInterval(() => { void fetchTodos(); }, 30000);
    const onFocus = () => { void fetchTodos(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchTodos]);

  const handleCreate = async () => {
    if (!newContent.trim() || creating) return;
    setCreating(true);
    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim(), priority: newPriority }),
      });
      setNewContent("");
      setNewPriority("medium");
      setFilter("pending");
      setDateFilter("");
      await fetchTodos();
    } finally { setCreating(false); }
  };

  const toggleStatus = async (todo: Todo) => {
    const newStatus: TodoStatus = todo.status === "pending" ? "done" : "pending";
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchTodos();
  };

  const updatePriority = async (todo: Todo, priority: TodoPriority) => {
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    await fetchTodos();
  };

  const handleSoftDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    await fetchTodos();
  };

  const handleHardDelete = async (id: string) => {
    if (!window.confirm("确定彻底删除？此操作不可恢复。")) return;
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _hardDelete: true }),
    });
    await fetchTodos();
  };

  const handleRestore = async (id: string) => {
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    await fetchTodos();
  };

  const filteredTodos = useMemo(() => {
    let base = todos;
    if (filter !== "all") {
      base = base.filter((t) => t.status === filter);
    }
    if (dateFilter) {
      base = base.filter((t) => getDateKey(t.createdAt) === dateFilter);
    }
    return base;
  }, [todos, filter, dateFilter]);

  const groups = useMemo(() => groupByDate(filteredTodos), [filteredTodos]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of todos) set.add(getDateKey(t.createdAt));
    return Array.from(set).sort().reverse();
  }, [todos]);

  return (
    <div className="flex h-full flex-col">
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

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="ml-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
          >
            <option value="">全部日期</option>
            {availableDates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <span className="text-xs text-[var(--muted)] ml-1">{filteredTodos.length} 条</span>
        </div>
      </div>

      {/* Scrollable todo list */}
      <div className="hide-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6">
          {filteredTodos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">☑</span>
              <p className="mt-3 text-sm text-[var(--muted)]">暂无待办事项</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.dateKey}>
                {/* Date divider */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--muted)]">{group.label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{group.dateKey}</span>
                  <div className="h-px flex-1 bg-[var(--line)]" />
                </div>

                <div className="space-y-2.5">
                  {group.items.map((todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      onToggleStatus={() => toggleStatus(todo)}
                      onCyclePriority={() => cyclePriority(todo)}
                      onSoftDelete={() => handleSoftDelete(todo.id)}
                      onHardDelete={() => handleHardDelete(todo.id)}
                      onRestore={() => handleRestore(todo.id)}
                      onOpenDetail={() => setDetailTodo(todo)}
                      onSynced={fetchTodos}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail modal */}
      {detailTodo && (
        <TodoDetailModal
          todo={detailTodo}
          onClose={() => setDetailTodo(null)}
          onRefresh={() => { setDetailTodo(null); fetchTodos(); }}
        />
      )}
    </div>
  );
}

/* ── Todo Card ── */

function TodoCard({
  todo,
  onToggleStatus,
  onChangePriority,
  onSoftDelete,
  onHardDelete,
  onRestore,
  onOpenDetail,
  onSynced,
}: {
  todo: Todo;
  onToggleStatus: () => void;
  onChangePriority: (priority: TodoPriority) => void;
  onSoftDelete: () => void;
  onHardDelete: () => void;
  onRestore: () => void;
  onOpenDetail: () => void;
  onSynced: () => void;
}) {
  const pc = priorityConfig[todo.priority];
  const isDeleted = todo.status === "deleted";
  const timeHint = extractTimeHint(todo.content);
  const needsResync = todo.syncedAt && todo.updatedAt > todo.syncedAt;
  const [priorityOpen, setPriorityOpen] = useState(false);

  return (
    <div
      className={[
        "rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 transition",
        isDeleted ? "opacity-50" : "hover:border-[var(--line-strong)] hover:shadow-sm cursor-pointer",
        todo.status === "done" && !isDeleted ? "opacity-60" : "",
      ].join(" ")}
      onClick={() => !isDeleted && onOpenDetail()}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_180px] items-stretch gap-3">
        {/* 左侧：内容卡片 */}
        <div className="flex items-start gap-3 pr-2 border-r border-dashed border-[var(--line)]">
          {!isDeleted && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleStatus(); }}
              className={[
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition",
                todo.status === "done"
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--line-strong)] hover:border-[var(--foreground)]",
              ].join(" ")}
            >
              {todo.status === "done" && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}

          <div className="min-w-0 flex-1" onClick={() => !isDeleted && onOpenDetail()}>
            <p className={[
              "truncate text-[15px] leading-relaxed font-medium",
              todo.status === "done" ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]",
            ].join(" ")}>
              {todo.content}
            </p>

            {/* Second row: time hint + created time */}
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

        {/* 右侧：操作卡片 */}
        <div className="flex flex-col items-end gap-2">
          {!isDeleted && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPriorityOpen((v) => !v); }}
                title={`优先级: ${pc.label}`}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${pc.bg}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                {pc.label}
              </button>
              {priorityOpen && (
                <div
                  className="absolute right-0 z-20 mt-1 w-28 rounded-lg border border-[var(--line)] bg-[var(--card)] p-1 shadow-lg"
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
          )}

          {isDeleted ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onRestore}
                className="rounded-md border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface)]"
              >
                恢复
              </button>
              <button
                type="button"
                onClick={onHardDelete}
                className="rounded-md px-2 py-0.5 text-xs text-rose-500 transition hover:bg-rose-500/10"
              >
                彻底删除
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {todo.recordId && (
                <a
                  href={`/records/${todo.recordId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-md border border-purple-400/40 px-2.5 py-1 text-[11px] font-medium text-purple-500 transition hover:border-purple-400 hover:bg-purple-500/5"
                >
                  来源
                </a>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSoftDelete(); }}
                className="shrink-0 text-xs text-[var(--muted)] transition hover:text-rose-500"
                title="删除"
              >
                ✕
              </button>
            </div>
          )}

          {!isDeleted && (
            <div className="mt-1 flex items-center gap-2">
              {todo.syncedAt && !needsResync ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/5 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  已同步滴答
                </span>
              ) : needsResync ? (
                <SyncTickTickBtn todoId={todo.id} onSynced={onSynced} label="重新同步" />
              ) : (
                <SyncTickTickBtn todoId={todo.id} onSynced={onSynced} label="同步滴答" />
              )}
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
    });
    setSaving(false);
    onRefresh();
  };

  const handleSync = async () => {
    setSyncing(true);
    setMsg("");
    try {
      const res = await fetch(`/api/todos/${todo.id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "同步失败"); }
      else { setMsg("已同步到滴答清单 ✓"); }
    } catch { setMsg("同步请求失败"); }
    finally { setSyncing(false); }
  };

  const needsResync = todo.syncedAt && todo.updatedAt > todo.syncedAt;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--foreground)]">待办详情</h3>
          <button type="button" onClick={onClose} className="text-lg text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-[var(--muted)]">内容</span>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
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
            {todo.recordId && <div className="col-span-2">来源记录：<a href={`/records/${todo.recordId}`} className="text-[var(--muted-strong)] hover:underline">{todo.recordId}</a></div>}
          </div>

          {/* Sync to TickTick */}
          <div className="flex items-center gap-3 rounded-lg bg-[var(--surface)] px-4 py-3">
            <div className="flex-1">
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
            <p className={["text-xs rounded-lg px-3 py-2", msg.includes("失败") ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"].join(" ")}>
              {msg}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
    </div>
  );
}

/* ── Inline Sync Button ── */

function SyncTickTickBtn({ todoId, onSynced, label }: { todoId: string; onSynced: () => void; label: string }) {
  const [syncing, setSyncing] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/todos/${todoId}/sync`, { method: "POST" });
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
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-1 rounded-md border border-purple-400/40 px-2.5 py-1 text-[11px] font-medium text-purple-500 transition hover:border-purple-400 hover:bg-purple-500/5 disabled:opacity-50"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8a6 6 0 0 1 10.3-4.1M14 8a6 6 0 0 1-10.3 4.1" />
          <path d="M14 2v4h-4M2 14v-4h4" />
        </svg>
        {syncing ? "同步中..." : label}
      </button>
      {errMsg && <span className="text-[10px] text-rose-500">{errMsg}</span>}
    </span>
  );
}
