"use client";

import { KeyboardEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SearchResponse } from "@/lib/types";

const HISTORY_KEY = "ai-box-search-history";
const MAX_HISTORY = 10;

const emptyState: SearchResponse = {
  answer: "",
  citations: [],
};

const examples = [
  "之前谁提到周五前补材料？",
  "那份报价截图发在哪个群里？",
  "关于文件管理需求，之前存过哪些原文？",
];

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: SearchResponse["citations"];
};

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim() || !text) return text;
  const keywords = query.split(/\s+/).filter((k) => k.length > 0);
  const pattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!pattern) return text;
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="rounded bg-yellow-200/60 px-0.5 text-inherit dark:bg-yellow-500/30">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SearchPanel({ onOpenRecord }: { onOpenRecord?: (recordId: string) => void } = {}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<SearchResponse>(emptyState);
  const [history, setHistory] = useState<string[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [followUp, setFollowUp] = useState("");
  const convEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    convEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const addToHistory = useCallback((q: string) => {
    setHistory((prev) => {
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((q: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      saveHistory(next);
      return next;
    });
  }, []);

  async function doSearch(q: string, historyMsgs: ConversationMessage[]) {
    setLoading(true);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q,
        history: historyMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const payload: SearchResponse = await res.json();
    setLoading(false);
    return payload;
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setSearched(true);
    addToHistory(query.trim());

    const userMsg: ConversationMessage = { role: "user", content: query.trim() };
    const newConv = [...conversation, userMsg];
    setConversation(newConv);

    const payload = await doSearch(query.trim(), newConv);
    setResult(payload);

    const assistantMsg: ConversationMessage = {
      role: "assistant",
      content: payload.answer,
      citations: payload.citations,
    };
    setConversation([...newConv, assistantMsg]);
    setQuery("");
  }

  async function handleFollowUp() {
    if (!followUp.trim()) return;
    const userMsg: ConversationMessage = { role: "user", content: followUp.trim() };
    const newConv = [...conversation, userMsg];
    setConversation(newConv);
    setFollowUp("");

    const payload = await doSearch(followUp.trim(), newConv);
    setResult(payload);

    const assistantMsg: ConversationMessage = {
      role: "assistant",
      content: payload.answer,
      citations: payload.citations,
    };
    setConversation([...newConv, assistantMsg]);
  }

  function handleReset() {
    setQuery("");
    setSearched(false);
    setResult(emptyState);
    setConversation([]);
    setFollowUp("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSearch();
    }
  }

  const lastQuery = conversation.filter((m) => m.role === "user").pop()?.content || query;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="ai-border rounded-2xl">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--card)] p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="一句话找回原文和出处..."
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="shrink-0 rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "搜索中..." : "搜索"}
          </button>
          {searched && (
            <button
              type="button"
              onClick={handleReset}
              className="shrink-0 rounded-xl border border-[var(--line)] px-5 py-2.5 text-sm font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              重置
            </button>
          )}
        </div>
      </div>

      {!searched && (
        <div className="space-y-3">
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

          {history.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">搜索历史</p>
              <div className="flex flex-wrap gap-2">
                {history.map((h) => (
                  <span
                    key={h}
                    className="group flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)]"
                  >
                    <button type="button" onClick={() => setQuery(h)} className="hover:text-[var(--foreground)]">
                      {h}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFromHistory(h); }}
                      className="hidden text-[var(--muted)] hover:text-rose-500 group-hover:inline"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {searched && (
        <div className="space-y-3">
          {/* Conversation thread */}
          {conversation.length > 0 && (
            <div className="space-y-3">
              {conversation.map((msg, idx) => (
                <div key={idx}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)]">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {msg.content && (
                        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4">
                          <p className="text-[15px] leading-7 text-[var(--foreground)]">
                            {highlightText(msg.content, lastQuery)}
                          </p>
                        </div>
                      )}
                      {msg.citations && msg.citations.length > 0 && msg.citations.map((citation) => (
                        <button
                          type="button"
                          key={`${citation.recordId}-${citation.score}-${idx}`}
                          onClick={() => citation.recordId && onOpenRecord?.(citation.recordId)}
                          className="block w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4 text-left transition hover:border-[var(--line-strong)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[15px] font-medium text-[var(--foreground)]">
                              {highlightText(citation.title, lastQuery)}
                            </p>
                            <span className="shrink-0 text-xs text-[var(--muted)]">
                              {citation.sourceLabel}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-7 text-[var(--muted-strong)]">
                            {highlightText(citation.snippet, lastQuery)}
                          </p>
                          {citation.reason && (
                            <p className="mt-2 text-xs text-[var(--muted)]">{citation.reason}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={convEndRef} />
            </div>
          )}

          {/* No results fallback (only when no conversation yet) */}
          {conversation.length === 0 && result.citations.length === 0 && !loading && (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-3xl">🔍</span>
              <p className="mt-3 text-sm text-[var(--muted)]">
                暂无命中结果，资料录入越完整搜索越准确。
              </p>
            </div>
          )}

          {/* Follow-up input */}
          {conversation.length >= 2 && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleFollowUp(); } }}
                placeholder="继续追问..."
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
              />
              <button
                type="button"
                onClick={handleFollowUp}
                disabled={loading || !followUp.trim()}
                className="shrink-0 rounded-lg bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
              >
                发送
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" />
              <span className="ml-3 text-sm text-[var(--muted)]">思考中...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
