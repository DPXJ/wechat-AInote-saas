import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordQuickActions } from "@/components/record-quick-actions";
import { SyncPreview } from "@/components/sync-preview";
import { getKnowledgeRecord } from "@/lib/records";
import type { RecordType, SyncRun } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本",
  image: "图片",
  pdf: "PDF",
  document: "文档",
  audio: "音频",
  video: "视频",
  mixed: "混合资料",
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

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = getKnowledgeRecord(id);

  if (!record) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
        >
          返回工作台
        </Link>

        <section className="mt-5 rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] px-6 py-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)] lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs tracking-[0.3em] text-slate-500">{record.sourceLabel}</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 lg:text-4xl">
                {record.title}
              </h1>
              <p className="mt-4 text-sm leading-8 text-slate-600 lg:text-base">
                {record.summary}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
                  {recordTypeLabels[record.recordType]}
                </span>
                {record.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:w-[360px] xl:grid-cols-1">
              <SummaryMetric label="入库时间" value={formatDateTime(record.createdAt)} />
              <SummaryMetric label="附件数量" value={`${record.assets.length} 个`} />
              <SummaryMetric label="同步次数" value={`${record.syncRuns.length} 次`} />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <section className="rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] p-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)]">
              <p className="text-xs tracking-[0.28em] text-slate-500">快速操作</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                先确认，再同步出去
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                如果这条资料已经整理得足够清楚，现在就可以发到 Notion 或投递到滴答清单。
              </p>
              <div className="mt-5">
                <RecordQuickActions recordId={record.id} />
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <ListCard
                title="AI 识别出的行动项"
                items={
                  record.actionItems.length > 0
                    ? record.actionItems
                    : ["当前没有识别出明确待办。"]
                }
              />
              <TextCard
                title="手动备注"
                content={record.contextNote || "这条资料没有填写手动备注。"}
              />
            </section>

            {record.contentText ? (
              <TextCard title="原始文本" content={record.contentText} />
            ) : null}

            {record.extractedText ? (
              <TextCard title="抽取文本" content={record.extractedText} />
            ) : null}
          </div>

          <div className="space-y-6">
            <SyncPreview record={record} />

            <section className="rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] p-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)]">
              <p className="text-xs tracking-[0.28em] text-slate-500">附件</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                原始文件与截图
              </h2>
              <div className="mt-5 space-y-3">
                {record.assets.length > 0 ? (
                  record.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={`/api/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-[24px] border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(39,73,118,0.08)]"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {asset.originalName}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {asset.mimeType} · {Math.max(1, Math.round(asset.byteSize / 1024))} KB
                      </p>
                    </a>
                  ))
                ) : (
                  <EmptyCard text="这条资料没有附件。" />
                )}
              </div>
            </section>

            <section className="rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] p-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)]">
              <p className="text-xs tracking-[0.28em] text-slate-500">同步历史</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                最近同步动作
              </h2>
              <div className="mt-5 space-y-3">
                {record.syncRuns.length > 0 ? (
                  record.syncRuns.map((run) => (
                    <article
                      key={run.id}
                      className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {syncTargetLabels[run.target]}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
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
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        {run.message}
                      </p>
                    </article>
                  ))
                ) : (
                  <EmptyCard text="还没有发生过同步动作。" />
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] p-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)]">
      <p className="text-xs tracking-[0.28em] text-slate-500">{title}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function TextCard({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-[34px] border border-[var(--line)] bg-[var(--card-strong)] p-6 shadow-[0_24px_70px_rgba(39,73,118,0.08)]">
      <p className="text-xs tracking-[0.28em] text-slate-500">{title}</p>
      <p className="mt-5 whitespace-pre-wrap text-sm leading-8 text-slate-700">
        {content}
      </p>
    </section>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-sm leading-7 text-slate-500">
      {text}
    </div>
  );
}
