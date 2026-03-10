"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type WorkspaceTab = "record" | "preview" | "search" | "settings";

const tabs: Array<{ id: WorkspaceTab; label: string; hint: string }> = [
  { id: "record", label: "记录", hint: "先收录资料" },
  { id: "preview", label: "预览", hint: "同步前确认" },
  { id: "search", label: "搜索", hint: "找回原文和上下文" },
  { id: "settings", label: "设置", hint: "Notion、滴答、OSS" },
];

const tabContent: Record<
  WorkspaceTab,
  { eyebrow: string; title: string; description: string }
> = {
  record: {
    eyebrow: "记录菜单",
    title: "先把资料放进来",
    description:
      "微信里的文本、截图、PDF、视频备注，先统一收录。只有先收录，后面的搜索、预览和同步才会可靠。",
  },
  preview: {
    eyebrow: "预览菜单",
    title: "同步前先过一眼",
    description:
      "这里集中看摘要、行动项、附件和同步预览。确认没问题后，再发到 Notion 或滴答清单。",
  },
  search: {
    eyebrow: "搜索菜单",
    title: "问一句，直接找回原文",
    description:
      "搜索结果会优先给出处、上下文片段和详情入口，避免只有一句黑盒式结论。",
  },
  settings: {
    eyebrow: "设置菜单",
    title: "把连接配置一次弄好",
    description:
      "Notion、滴答清单邮箱和 OSS 都放在这里。配置保存后，后续同步就不需要反复填写。",
  },
};

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本",
  image: "图片",
  pdf: "PDF",
  document: "文档",
  audio: "音频",
  video: "视频",
  mixed: "混合资料",
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

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || records[0] || null,
    [records, selectedRecordId],
  );
  const stats = useMemo(
    () => ({
      total: records.length,
      assets: records.reduce((sum, record) => sum + record.assets.length, 0),
      actionable: records.filter((record) => record.actionItems.length > 0).length,
    }),
    [records],
  );
  const activeMeta = tabContent[activeTab];

  return (
    <main className="grain min-h-screen bg-[var(--background)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 lg:flex-row lg:gap-6 lg:px-6">
        <aside className="mb-4 shrink-0 lg:mb-0 lg:w-[272px]">
          <div className="rounded-[32px] border border-stone-300 bg-white/80 p-5 shadow-[0_20px_70px_rgba(69,52,41,0.08)]">
            <p className="text-xs tracking-[0.32em] text-stone-500">微信资料台</p>
            <h1 className="mt-3 font-serif text-3xl leading-tight text-stone-950">
              手动同步版
            </h1>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              先记录，再预览，再搜索，最后才同步。这样更稳，也更适合你现在的实际使用方式。
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <MetricCard label="资料" value={String(stats.total)} />
              <MetricCard label="附件" value={String(stats.assets)} />
              <MetricCard label="待跟进" value={String(stats.actionable)} />
            </div>

            <nav className="mt-6 space-y-2">
              {tabs.map((tab, index) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex w-full items-center justify-between rounded-[20px] px-4 py-4 text-left transition",
                    activeTab === tab.id
                      ? "bg-stone-950 text-stone-50"
                      : "bg-stone-50 text-stone-800 hover:bg-stone-100",
                  ].join(" ")}
                >
                  <span>
                    <span className="block text-base font-medium">{tab.label}</span>
                    <span
                      className={[
                        "mt-1 block text-xs",
                        activeTab === tab.id ? "text-stone-300" : "text-stone-500",
                      ].join(" ")}
                    >
                      {tab.hint}
                    </span>
                  </span>
                  <span className="text-xs tracking-[0.2em]">0{index + 1}</span>
                </button>
              ))}
            </nav>

            <div className="mt-6 rounded-[22px] border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs tracking-[0.24em] text-stone-500">当前连接</p>
              <div className="mt-3 space-y-2 text-xs leading-6 text-stone-600">
                <p>存储：{integrationStatus.storage.label}</p>
                <p>Notion：{integrationStatus.notion.configured ? "已连接" : "未配置"}</p>
                <p>
                  滴答邮箱：
                  {integrationStatus.ticktickEmail.configured ? "已连接" : "未配置"}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-6 rounded-[32px] border border-stone-300 bg-[var(--card)] px-6 py-6 shadow-[0_24px_90px_rgba(73,52,42,0.08)]">
            <p className="text-xs tracking-[0.3em] text-stone-500">{activeMeta.eyebrow}</p>
            <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <h2 className="font-serif text-4xl leading-tight text-stone-950">
                  {activeMeta.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-stone-700">
                  {activeMeta.description}
                </p>
              </div>
              <div className="rounded-[24px] border border-stone-200 bg-white/75 px-4 py-4 text-sm leading-7 text-stone-600 xl:max-w-sm">
                <p className="font-medium text-stone-900">当前主流程</p>
                <p className="mt-2">
                  资料录入是第一优先级；设置和同步是辅助动作，不再抢首页入口。
                </p>
              </div>
            </div>
          </header>

          {activeTab === "record" ? (
            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[32px] border border-stone-300 bg-white/85 p-6 shadow-[0_24px_90px_rgba(73,52,42,0.08)]">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs tracking-[0.3em] text-stone-500">资料录入</p>
                    <h2 className="mt-2 font-serif text-3xl text-stone-950">
                      今天先记什么
                    </h2>
                  </div>
                  <p className="max-w-xs text-sm leading-7 text-stone-600">
                    这里是主入口。微信里的文字、截图、PDF、视频备注，都先统一进入这里。
                  </p>
                </div>

                <InboxForm />
              </div>

              <section className="rounded-[32px] border border-stone-300 bg-white/85 p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs tracking-[0.3em] text-stone-500">最近记录</p>
                    <h2 className="mt-2 font-serif text-3xl text-stone-950">
                      刚刚收录的资料
                    </h2>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                    共 {records.length} 条
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {records.length > 0 ? (
                    records.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => {
                          setSelectedRecordId(record.id);
                          setActiveTab("preview");
                        }}
                        className={[
                          "block w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedRecord?.id === record.id
                            ? "border-stone-900 bg-stone-950 text-stone-50"
                            : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={[
                                "text-xs tracking-[0.22em]",
                                selectedRecord?.id === record.id
                                  ? "text-stone-300"
                                  : "text-stone-500",
                              ].join(" ")}
                            >
                              {record.sourceLabel}
                            </p>
                            <p className="mt-2 truncate text-sm font-medium">
                              {record.title}
                            </p>
                          </div>
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs",
                              selectedRecord?.id === record.id
                                ? "bg-white/10 text-stone-200"
                                : "bg-white text-stone-600",
                            ].join(" ")}
                          >
                            {recordTypeLabels[record.recordType]}
                          </span>
                        </div>
                        <p
                          className={[
                            "mt-3 line-clamp-2 text-sm leading-7",
                            selectedRecord?.id === record.id
                              ? "text-stone-200"
                              : "text-stone-600",
                          ].join(" ")}
                        >
                          {record.summary}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p
                            className={[
                              "text-xs",
                              selectedRecord?.id === record.id
                                ? "text-stone-400"
                                : "text-stone-500",
                            ].join(" ")}
                          >
                            {formatDateTime(record.createdAt)}
                          </p>
                          <span
                            className={[
                              "text-xs",
                              selectedRecord?.id === record.id
                                ? "text-stone-400"
                                : "text-stone-500",
                            ].join(" ")}
                          >
                            附件 {record.assets.length}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-stone-300 px-4 py-8 text-sm leading-7 text-stone-600">
                      还没有资料。先在左侧录入第一条文字，或者上传一个 PDF / 图片开始。
                    </div>
                  )}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "preview" ? (
            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[32px] border border-stone-300 bg-white/85 p-6">
                <p className="text-xs tracking-[0.3em] text-stone-500">当前资料</p>
                <h2 className="mt-2 font-serif text-3xl text-stone-950">
                  看摘要、行动项和附件
                </h2>

                {selectedRecord ? (
                  <>
                    <div className="mt-5 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs tracking-[0.22em] text-stone-500">
                            {selectedRecord.sourceLabel}
                          </p>
                          <h3 className="mt-2 text-xl font-medium text-stone-900">
                            {selectedRecord.title}
                          </h3>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-600">
                          {recordTypeLabels[selectedRecord.recordType]}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-stone-700">
                        {selectedRecord.summary}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedRecord.keywords.slice(0, 5).map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-white px-3 py-1 text-xs text-stone-600"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-stone-500">
                        录入时间：{formatDateTime(selectedRecord.createdAt)}
                      </p>
                    </div>

                    <div className="mt-5">
                      <RecordQuickActions recordId={selectedRecord.id} />
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                        <p className="text-xs tracking-[0.22em] text-stone-500">行动项</p>
                        <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                          {selectedRecord.actionItems.length > 0 ? (
                            selectedRecord.actionItems.map((item) => (
                              <p key={item}>- {item}</p>
                            ))
                          ) : (
                            <p>当前没有识别出明确待办。</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                        <p className="text-xs tracking-[0.22em] text-stone-500">补充备注</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                          {selectedRecord.contextNote || "这条资料没有填写手动备注。"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs tracking-[0.22em] text-stone-500">附件</p>
                        <Link
                          href={`/records/${selectedRecord.id}`}
                          className="text-xs text-stone-500 transition hover:text-stone-900"
                        >
                          查看完整详情
                        </Link>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedRecord.assets.length > 0 ? (
                          selectedRecord.assets.map((asset) => (
                            <a
                              key={asset.id}
                              href={`/api/assets/${asset.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 transition hover:border-stone-400"
                            >
                              {asset.originalName}
                            </a>
                          ))
                        ) : (
                          <p className="text-sm text-stone-500">这条资料没有附件。</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-[24px] border border-dashed border-stone-300 px-4 py-8 text-sm leading-7 text-stone-600">
                    还没有可预览的资料。先去“记录”菜单录入一条内容。
                  </div>
                )}
              </div>

              <div className="rounded-[32px] border border-stone-300 bg-white/85 p-6">
                {selectedRecord ? (
                  <div className="space-y-4">
                    <SyncPreview record={selectedRecord} />
                    <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 text-sm leading-7 text-stone-700">
                      <p className="font-medium text-stone-900">预览原则</p>
                      <p className="mt-2">
                        待办先看标题是否准确，知识沉淀先看摘要是否完整。确认后再同步，能减少后面清理数据的成本。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-stone-300 px-4 py-8 text-sm leading-7 text-stone-600">
                    录入资料后，这里会显示同步到 Notion 和滴答清单的预览内容。
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "search" ? (
            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <SearchPanel />
              <section className="rounded-[32px] border border-stone-300 bg-white/85 p-6">
                <p className="text-xs tracking-[0.3em] text-stone-500">搜索建议</p>
                <h2 className="mt-2 font-serif text-3xl text-stone-950">
                  这样问更容易命中
                </h2>
                <div className="mt-5 space-y-3 text-sm leading-7 text-stone-700">
                  <p>先问事件，例如“上周那个合同 PDF 里写的交付时间是什么”。</p>
                  <p>再问任务，例如“之前谁提到周五前补材料”。</p>
                  <p>如果是截图，尽量带上人物、群名、文件名这些上下文。</p>
                </div>

                <div className="mt-6 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                  <p className="text-sm font-medium text-stone-900">最近可搜索资料</p>
                  <div className="mt-3 space-y-3">
                    {records.slice(0, 4).map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => {
                          setSelectedRecordId(record.id);
                          setActiveTab("preview");
                        }}
                        className="block w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left text-sm text-stone-700 transition hover:border-stone-400"
                      >
                        <p className="font-medium text-stone-900">{record.title}</p>
                        <p className="mt-1 line-clamp-2 text-stone-600">{record.summary}</p>
                      </button>
                    ))}
                    {records.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        先录入几条资料，搜索会更有价值。
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <IntegrationsPanel
              initialSettings={integrationSettings}
              initialStatus={integrationStatus}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-stone-50 px-3 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-medium text-stone-900">{value}</p>
    </div>
  );
}
