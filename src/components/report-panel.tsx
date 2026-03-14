"use client";

import { useCallback, useEffect, useState } from "react";

type ReportData = {
  period: string;
  startDate: string;
  newRecords: number;
  typeDist: Array<{ record_type: string; cnt: number }>;
  completedTodos: number;
  pendingTodos: number;
  activeDays: number;
  topKeywords: Array<{ keyword: string; count: number }>;
};

const typeLabels: Record<string, string> = {
  text: "文本",
  image: "图片",
  pdf: "PDF",
  document: "文档",
  audio: "音频",
  video: "视频",
  mixed: "混合",
};

export function ReportPanel() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reports?period=${period}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          知识报告
        </h2>
        <div className="flex gap-1 rounded-xl bg-[var(--surface)] p-1">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                period === p
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-strong)] hover:text-[var(--foreground)]"
              }`}
            >
              {p === "week" ? "本周" : "本月"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[var(--muted)]">
          <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" />
          加载中...
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "新增记录", value: data.newRecords },
              { label: "活跃天数", value: data.activeDays },
              { label: "完成待办", value: data.completedTodos },
              { label: "待处理", value: data.pendingTodos },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-center"
              >
                <p className="text-2xl font-bold text-[var(--foreground)]">{s.value}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Type distribution */}
          {data.typeDist.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">类型分布</h3>
              <div className="space-y-2">
                {data.typeDist.map((item) => {
                  const pct = data.newRecords > 0 ? (item.cnt / data.newRecords) * 100 : 0;
                  return (
                    <div key={item.record_type} className="flex items-center gap-3">
                      <span className="w-12 text-right text-sm text-[var(--muted-strong)]">
                        {typeLabels[item.record_type] || item.record_type}
                      </span>
                      <div className="flex-1 rounded-full bg-[var(--surface)] h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            background: "var(--ai-gradient)",
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-medium text-[var(--foreground)]">
                        {item.cnt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top keywords */}
          {data.topKeywords.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                高频关键词 Top {data.topKeywords.length}
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.topKeywords.map((kw, i) => (
                  <span
                    key={kw.keyword}
                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                    style={{
                      fontSize: `${Math.max(12, 16 - i)}px`,
                      color: i < 3 ? "var(--foreground)" : "var(--muted-strong)",
                    }}
                  >
                    {kw.keyword}
                    <span className="ml-1 text-xs text-[var(--muted)]">({kw.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
