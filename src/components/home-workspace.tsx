"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { InboxForm } from "@/components/inbox-form";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { RecordQuickActions } from "@/components/record-quick-actions";
import { SearchPanel } from "@/components/search-panel";
import { SyncPreview } from "@/components/sync-preview";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  RecordType,
  SyncRun,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type WorkspaceTab = "record" | "history" | "search" | "settings";
type HistoryFilter = "all" | "todo" | "synced" | "text" | "asset";

const tabs: Array<{ id: WorkspaceTab; label: string; shortLabel: string }> = [
  { id: "record", label: "记录", shortLabel: "收录资料" },
  { id: "history", label: "历史记录", shortLabel: "查看结果" },
  { id: "search", label: "AI 搜索", shortLabel: "找回原文" },
  { id: "settings", label: "设置", shortLabel: "配置通道" },
];

const tabMeta: Record<WorkspaceTab, { title: string; summary: string }> = {
  record: {
    title: "内容录入",
    summary: "文本直接粘贴，附件按类型上传。",
  },
  history: {
    title: "历史记录",
    summary: "按时间查看资料、AI 摘要和同步状态。",
  },
  search: {
    title: "AI 搜索",
    summary: "一句话找回原文、出处和上下文。",
  },
  settings: {
    title: "连接设置",
    summary: "把 Notion、滴答邮箱和 OSS 配置到可用状态。",
  },
};

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本",
  image: "图片",
  pdf: "PDF",
  document: "文档",
  audio: "音频",
  video: "视频",
  mixed: "混合",
};

const syncTargetLabels: Record<SyncRun["target"], string> = {
  notion: "Notion",
  "ticktick-email": "滴答清单",
  "feishu-doc": "飞书文档",
};

const syncStatusLabels: Record<
  SyncRun["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "处理中",
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  synced: {
    label: "已同步",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  failed: {
    label: "失败",
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
};

export function HomeWorkspace({
  records,
  integrationSettings,
  integrationStatus,
}: {
  records: KnowledgeRecord[];
  integrationSettings: IntegrationSettings;
  integrationStatus: IntegrationStatus;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("record");
  const [selectedRecordId, setSelectedRecordId] = useState(records[0]?.id || "");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const savedTheme = window.localStorage.getItem("ai-box-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ai-box-theme", theme);
  }, [theme]);

  const stats = useMemo(
    () => ({
      total: records.length,
      actionable: records.filter((record) => record.actionItems.length > 0).length,
      synced: records.reduce((sum, record) => {
        return sum + record.syncRuns.filter((run) => run.status === "synced").length;
      }, 0),
    }),
    [records],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (historyFilter === "todo") {
        return record.actionItems.length > 0;
      }

      if (historyFilter === "synced") {
        return record.syncRuns.some((run) => run.status === "synced");
      }

      if (historyFilter === "text") {
        return record.recordType === "text";
      }

      if (historyFilter === "asset") {
        return record.recordType !== "text";
      }

      return true;
    });
  }, [historyFilter, records]);

  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((record) => record.id === selectedRecordId) ||
      filteredRecords[0] ||
      null,
    [filteredRecords, selectedRecordId],
  );

  const activeMeta = tabMeta[activeTab];
  const statusSummary = [
    integrationStatus.notion.configured ? "Notion 已连接" : "Notion 未配置",
    integrationStatus.smtp.configured && integrationStatus.ticktickEmail.configured
      ? "滴答自动识别待办"
      : "滴答未配置",
    `附件${integrationSettings.storageMode === "oss" ? "走 OSS" : "本地保存"}`,
  ].join(" · ");

  return (
    <main className="grain min-h-screen bg-[var(--background)]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-3 px-4 py-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6 lg:py-4">
        <aside className="hidden self-stretch lg:block">
          <div className="flex h-full flex-col rounded-[28px] border border-[var(--line)] bg-[var(--card-strong)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="rounded-[22px] bg-slate-950 px-4 py-4 text-white">
              <p className="text-[11px] tracking-[0.3em] text-slate-400">微信资料台</p>
              <h1 className="mt-2 font-serif text-[28px] leading-none">AI 收件箱</h1>
              <p className="mt-3 text-sm text-slate-300">把微信里的内容先收进来。</p>
            </div>

            <nav className="mt-4 flex-1 space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "w-full rounded-[20px] border px-4 py-3 text-left transition",
                    activeTab === tab.id
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--line-strong)]",
                  ].join(" ")}
                >
                  <p className="text-sm font-medium">{tab.label}</p>
                  <p
                    className={[
                      "mt-1 text-xs",
                      activeTab === tab.id ? "text-slate-300" : "text-[var(--muted)]",
                    ].join(" ")}
                  >
                    {tab.shortLabel}
                  </p>
                </button>
              ))}
            </nav>

            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
              <p className="text-xs tracking-[0.24em] text-[var(--muted)]">当前规则</p>
              <div className="mt-3 space-y-2 text-sm text-[var(--foreground)]">
                <p>Notion 自动同步</p>
                <p>识别明确时间自动投递滴答</p>
                <p>附件可切到 OSS 存储</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex gap-2 overflow-auto pb-2 lg:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "shrink-0 rounded-full px-4 py-2 text-sm transition",
                  activeTab === tab.id
                    ? "bg-slate-950 text-white"
                    : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted-strong)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--card-strong)] px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:px-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div>
                <h2 className="font-serif text-2xl text-[var(--foreground)]">
                  {activeMeta.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{activeMeta.summary}</p>
                <p className="mt-1 text-sm text-[var(--muted-strong)]">{statusSummary}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[repeat(3,88px)_auto]">
                <MiniStat label="资料" value={String(stats.total)} />
                <MiniStat label="待办" value={String(stats.actionable)} />
                <MiniStat label="同步" value={String(stats.synced)} />
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
                  className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)]"
                >
                  {theme === "light" ? "切换暗色" : "切换亮色"}
                </button>
              </div>
            </div>
          </section>

          {activeTab === "record" ? (
            <section className="mt-3 rounded-[32px] border border-[var(--line)] bg-[var(--card-strong)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] lg:p-5">
              <InboxForm
                onCreated={(recordId) => {
                  setSelectedRecordId(recordId);
                }}
              />
            </section>
          ) : null}

          {activeTab === "history" ? (
            <section className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section className="rounded-[28px] border border-[var(--line)] bg-[var(--card-strong)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">最近资料</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">按最近录入时间排序</p>
                  </div>
                  <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted-strong)]">
                    {filteredRecords.length} 条
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: "all", label: "全部" },
                    { id: "todo", label: "仅待办" },
                    { id: "synced", label: "仅已同步" },
                    { id: "text", label: "文本" },
                    { id: "asset", label: "附件" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHistoryFilter(item.id as HistoryFilter)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        historyFilter === item.id
                          ? "border-slate-900 bg-slate-950 text-white"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--line-strong)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => setSelectedRecordId(record.id)}
                        className={[
                          "flex w-full items-start justify-between gap-3 border-b border-[var(--line)] px-2 py-4 text-left transition last:border-b-0",
                          selectedRecord?.id === record.id
                            ? "rounded-[18px] bg-slate-950 text-white"
                            : "text-[var(--foreground)] hover:bg-[var(--surface)]",
                        ].join(" ")}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={
                                selectedRecord?.id === record.id
                                  ? "text-slate-300"
                                  : "text-[var(--muted)]"
                              }
                            >
                              {record.sourceLabel}
                            </span>
                            <span
                              className={[
                                "rounded-full px-2 py-0.5",
                                selectedRecord?.id === record.id
                                  ? "bg-white/10 text-slate-200"
                                  : "bg-[var(--surface)] text-[var(--muted-strong)]",
                              ].join(" ")}
                            >
                              {recordTypeLabels[record.recordType]}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm font-medium">{record.title}</p>
                          <p
                            className={[
                              "mt-2 line-clamp-2 text-sm leading-6",
                              selectedRecord?.id === record.id
                                ? "text-slate-300"
                                : "text-[var(--muted-strong)]",
                            ].join(" ")}
                          >
                            {record.summary}
                          </p>
                          <p
                            className={[
                              "mt-2 text-xs",
                              selectedRecord?.id === record.id
                                ? "text-slate-400"
                                : "text-[var(--muted)]",
                            ].join(" ")}
                          >
                            {formatDateTime(record.createdAt)}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyCard text="还没有资料，先去记录里收录内容。" />
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-[var(--line)] bg-[var(--card-strong)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                {selectedRecord ? (
                  <>
                    <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                          <span>{selectedRecord.sourceLabel}</span>
                          <span>·</span>
                          <span>{recordTypeLabels[selectedRecord.recordType]}</span>
                          <span>·</span>
                          <span>{formatDateTime(selectedRecord.createdAt)}</span>
                        </div>
                        <h3 className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
                          {selectedRecord.title}
                        </h3>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-strong)]">
                          {selectedRecord.summary}
                        </p>
                      </div>
                      <Link
                        href={`/records/${selectedRecord.id}`}
                        className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)]"
                      >
                        查看完整详情
                      </Link>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {selectedRecord.keywords.length > 0 ? (
                        selectedRecord.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted-strong)]"
                          >
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--muted)]">暂无关键词。</span>
                      )}
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <InfoPanel
                        title="行动项"
                        content={
                          selectedRecord.actionItems.length > 0
                            ? selectedRecord.actionItems.join("\n")
                            : "当前没有识别出明确待办。"
                        }
                      />
                      <InfoPanel
                        title="补充说明"
                        content={selectedRecord.contextNote || "没有补充说明。"}
                      />
                    </div>

                    <div className="mt-5 border-t border-[var(--line)] pt-5">
                      <RecordQuickActions recordId={selectedRecord.id} />
                    </div>

                    <details className="mt-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-[var(--foreground)]">
                        查看同步预览
                      </summary>
                      <div className="mt-4">
                        <SyncPreview record={selectedRecord} compact />
                      </div>
                    </details>

                    <details
                      open
                      className="mt-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
                    >
                      <summary className="cursor-pointer list-none text-sm font-medium text-[var(--foreground)]">
                        同步历史
                      </summary>
                      <div className="mt-4 space-y-3">
                        {selectedRecord.syncRuns.length > 0 ? (
                          selectedRecord.syncRuns.map((run) => (
                            <article
                              key={run.id}
                              className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-[var(--foreground)]">
                                    {syncTargetLabels[run.target]}
                                  </p>
                                  <p className="mt-1 text-xs text-[var(--muted)]">
                                    {formatDateTime(run.createdAt)}
                                  </p>
                                </div>
                                <span
                                  className={[
                                    "rounded-full px-3 py-1 text-xs",
                                    syncStatusLabels[run.status].className,
                                  ].join(" ")}
                                >
                                  {syncStatusLabels[run.status].label}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-7 text-[var(--muted-strong)]">
                                {run.message}
                              </p>
                            </article>
                          ))
                        ) : (
                          <EmptyCard text="还没有同步记录。" />
                        )}
                      </div>
                    </details>
                  </>
                ) : (
                  <EmptyCard text="从左侧选择一条资料，这里会显示 AI 整理结果和同步状态。" />
                )}
              </section>
            </section>
          ) : null}

          {activeTab === "search" ? (
            <section className="mt-4">
              <SearchPanel />
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="mt-4">
              <IntegrationsPanel
                initialSettings={integrationSettings}
                initialStatus={integrationStatus}
              />
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-center">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-strong)] px-4 py-8 text-sm leading-7 text-[var(--muted)]">
      {text}
    </div>
  );
}

function InfoPanel({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--muted-strong)]">
        {content}
      </p>
    </div>
  );
}
