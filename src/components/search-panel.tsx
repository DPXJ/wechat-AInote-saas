"use client";

import Link from "next/link";
import { KeyboardEvent, useState } from "react";
import type { SearchResponse } from "@/lib/types";

const emptyState: SearchResponse = {
  answer: "直接问一句，例如：上周那个合同 PDF 里提到的交付时间是什么？",
  citations: [],
};

const examples = [
  "之前谁提到周五前补材料？",
  "那份报价截图发在哪个群里？",
  "关于文件管理需求调研，之前存过哪些原文？",
];

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse>(emptyState);

  async function handleSearch() {
    if (!query.trim()) {
      setResult(emptyState);
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    setResult(payload);
    setLoading(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSearch();
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-[var(--card-strong)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] lg:p-6">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.28em] text-[var(--muted)]">AI 搜索</p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--foreground)]">
            问一句，直接找回原文
          </h2>
        </div>
        <p className="text-sm text-[var(--muted)]">按 Enter 搜索，Shift + Enter 换行。</p>
      </div>

      <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          placeholder="例如：之前谁提过周五前补材料？"
          className="w-full resize-none border-none bg-transparent text-sm leading-7 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--muted-strong)] transition hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "搜索中..." : "开始搜索"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4">
        <p className="text-sm leading-8 text-[var(--foreground)]">{result.answer}</p>

        {result.citations.length > 0 ? (
          <div className="mt-5 space-y-3">
            {result.citations.map((citation) => (
              <Link
                key={`${citation.recordId}-${citation.score}`}
                href={`/records/${citation.recordId}`}
                className="block rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {citation.title}
                  </p>
                  <span className="text-xs text-[var(--muted)]">{citation.sourceLabel}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-strong)]">
                  {citation.snippet}
                </p>
                <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
                  {citation.reason}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            暂无命中结果。资料录入越完整，搜索越容易带回准确出处和上下文。
          </p>
        )}
      </div>
    </section>
  );
}
