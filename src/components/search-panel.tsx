"use client";

import Link from "next/link";
import { KeyboardEvent, useState } from "react";
import type { SearchResponse } from "@/lib/types";

const emptyState: SearchResponse = {
  answer: "",
  citations: [],
};

const examples = [
  "之前谁提到周五前补材料？",
  "那份报价截图发在哪个群里？",
  "关于文件管理需求，之前存过哪些原文？",
];

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<SearchResponse>(emptyState);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    setResult(payload);
    setLoading(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSearch();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Search input */}
      <div className="flex gap-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="一句话找回原文和出处..."
          className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-3.5 text-[15px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="shrink-0 rounded-2xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "搜索中..." : "搜索"}
        </button>
      </div>

      {/* Examples */}
      {!searched && (
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="rounded-xl bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="space-y-3">
          {result.answer && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4">
              <p className="text-[15px] leading-7 text-[var(--foreground)]">{result.answer}</p>
            </div>
          )}

          {result.citations.length > 0 ? (
            result.citations.map((citation) => (
              <Link
                key={`${citation.recordId}-${citation.score}`}
                href={`/records/${citation.recordId}`}
                className="block rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4 transition hover:border-[var(--accent)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-medium text-[var(--foreground)]">
                    {citation.title}
                  </p>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {citation.sourceLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-7 text-[var(--muted-strong)]">
                  {citation.snippet}
                </p>
                {citation.reason && (
                  <p className="mt-2 text-xs text-[var(--muted)]">{citation.reason}</p>
                )}
              </Link>
            ))
          ) : !loading ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">🔍</span>
              <p className="mt-3 text-sm text-[var(--muted)]">
                暂无命中结果，资料录入越完整搜索越准确。
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
