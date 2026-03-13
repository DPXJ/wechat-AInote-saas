"use client";

import { useCallback, useEffect, useState } from "react";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

type TodoFilter = "all" | "pending" | "done";

const priorityConfig: Record<TodoPriority, { label: string; dot: string; bg: string }> = {
  urgent: { label: "紧急", dot: "bg-rose-500", bg: "bg-rose-500/10 text-rose-600" },
  high: { label: "高", dot: "bg-orange-500", bg: "bg-orange-500/10 text-orange-600" },
  medium: { label: "中", dot: "bg-blue-500", bg: "bg-blue-500/10 text-blue-600" },
  low: { label: "低", dot: "bg-gray-400", bg: "bg-gray-400/10 text-gray-500" },
};

const priorities: TodoPriority[] = ["urgent", "high", "medium", "low"];

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [newContent, setNewContent] = useState("");
  const [newPriority, setNewPriority] = useState<TodoPriority>("medium");
  const [creating, setCreating] = useState(false);

  const fetchTodos = useCallback(async () => {
    const statusParam = filter === "all" ? "" : `&status=${filter}`;
    const res = await fetch(`/api/todos?limit=100${statusParam}`);
    const data = await res.json();
    setTodos(data.todos);
    setTotal(data.total);
  }, [filter]);

  useEffect(() => {
    fetchTodos();
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
      await fetchTodos();
    } finally {
      setCreating(false);
    }
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

  const cyclePriority = async (todo: Todo) => {
    const idx = priorities.indexOf(todo.priority);
    const next = priorities[(idx + 1) % priorities.length];
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: next }),
    });
    await fetchTodos();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    await fetchTodos();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-bold text-[var(--foreground)]">待办事项</h2>

      {/* Quick create */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="添加新待办..."
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)]"
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {priorityConfig[p].label}
            </option>
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

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(
          [
            { id: "all", label: "全部" },
            { id: "pending", label: "进行中" },
            { id: "done", label: "已完成" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              filter === f.id
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-[var(--muted)]">{total} 条</span>
      </div>

      {/* Todo list */}
      <div className="space-y-1.5">
        {todos.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="text-3xl">☑</span>
            <p className="mt-3 text-sm text-[var(--muted)]">暂无待办事项</p>
          </div>
        ) : (
          todos.map((todo) => {
            const pc = priorityConfig[todo.priority];
            return (
              <div
                key={todo.id}
                className={[
                  "flex items-start gap-3 rounded-xl px-4 py-3 transition hover:bg-[var(--surface)]",
                  todo.status === "done" ? "opacity-60" : "",
                ].join(" ")}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleStatus(todo)}
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

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "text-sm leading-snug",
                      todo.status === "done"
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--foreground)]",
                    ].join(" ")}
                  >
                    {todo.content}
                  </p>
                  {todo.recordId && (
                    <a
                      href={`/records/${todo.recordId}`}
                      className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline"
                    >
                      来源记录 →
                    </a>
                  )}
                </div>

                {/* Priority dot (click to cycle) */}
                <button
                  type="button"
                  onClick={() => cyclePriority(todo)}
                  title={`优先级: ${pc.label}（点击切换）`}
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${pc.bg}`}
                >
                  {pc.label}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(todo.id)}
                  className="shrink-0 text-sm text-[var(--muted)] transition hover:text-rose-500"
                  title="删除"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
