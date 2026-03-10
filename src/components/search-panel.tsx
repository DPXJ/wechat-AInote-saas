"use client";

import Link from "next/link";
import { KeyboardEvent, useState } from "react";
import type { SearchResponse } from "@/lib/types";

const emptyState: SearchResponse = {
  answer:
    "试着直接问一句，例如：上周那个合同 PDF 里提到的交付时间是什么？",
  citations: [],
};

const examples = [
  "之前谁提到周五前补材料？",
  "那份报价截图是发在哪个群里的？",
  "关于文件管理需求调研，之前存过什么原文？",
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
    <section className="rounded-[32px] border border-stone-300 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.25)]">
      <div className="space-y-2">
        <p className="text-xs tracking-[0.34em] text-stone-400">AI 搜索</p>
        <h2 className="font-serif text-3xl">问一句，直接回到原文</h2>
        <p className="text-sm leading-7 text-stone-400">
          搜索结果会优先返回资料出处、上下文片段和详情入口，方便你确认原始语境。
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="例如：之前谁提过周五前补材料？"
          className="w-full rounded-[24px] border border-stone-700 bg-stone-900 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="rounded-full border border-stone-700 px-3 py-1 text-xs text-stone-300 transition hover:border-stone-500 hover:text-stone-50"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="rounded-full border border-stone-600 px-5 py-2 text-sm transition hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "搜索中..." : "开始搜索"}
        </button>
      </div>

      <div className="mt-6 rounded-[24px] border border-stone-800 bg-black/20 p-5">
        <p className="text-sm leading-7 text-stone-100">{result.answer}</p>

        {result.citations.length > 0 ? (
          <div className="mt-5 space-y-3">
            {result.citations.map((citation) => (
              <Link
                key={`${citation.recordId}-${citation.score}`}
                href={`/records/${citation.recordId}`}
                className="block rounded-2xl border border-stone-800 bg-stone-900/80 p-4 transition hover:border-stone-600"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-100">
                    {citation.title}
                  </p>
                  <span className="text-xs tracking-[0.24em] text-stone-500">
                    {citation.sourceLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-400">{citation.snippet}</p>
                <p className="mt-2 text-xs text-stone-500">{citation.reason}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs leading-6 text-stone-500">
            录入的资料越完整，搜索结果越容易带回准确出处和上下文。
          </p>
        )}
      </div>
    </section>
  );
}
