"use client";

import { useCallback, useEffect, useState } from "react";

export type TagItem = { tag: string; count: number };

export function TagManager({ initialTags }: { initialTags?: TagItem[] | null } = {}) {
  const [tags, setTags] = useState<TagItem[]>(initialTags ?? []);
  const [filter, setFilter] = useState("");
  const hasInitial = initialTags != null;
  const [loading, setLoading] = useState(!hasInitial);

  const fetchTags = useCallback(async () => {
    if (!hasInitial) setLoading(true);
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data.tags || []);
    setLoading(false);
  }, [hasInitial]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  async function handleDelete(tag: string) {
    if (!confirm(`确定删除标签「${tag}」？将从所有记录和资产中移除此标签。`)) return;
    await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    fetchTags();
  }

  const filtered = filter
    ? tags.filter((t) => t.tag.includes(filter.toLowerCase()))
    : tags;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-[var(--foreground)]">标签管理</h2>
        <span className="text-sm text-[var(--muted)]">共 {tags.length} 个标签</span>
      </div>

      <div className="relative">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索标签..."
          className="input-focus-bar w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
        />
      </div>

      {loading && tags.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">暂无标签</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtered.map((item) => (
            <span
              key={item.tag}
              className="group flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)]"
            >
              {item.tag}
              <span className="text-xs text-[var(--muted)]">({item.count})</span>
              <button
                type="button"
                onClick={() => handleDelete(item.tag)}
                className="ml-1 hidden text-[var(--muted)] hover:text-rose-500 group-hover:inline"
                title="删除标签"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
