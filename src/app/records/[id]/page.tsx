import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordQuickActions } from "@/components/record-quick-actions";
import { SyncPreview } from "@/components/sync-preview";
import { getKnowledgeRecord } from "@/lib/records";
import { formatDateTime } from "@/lib/utils";

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
    <main className="min-h-screen px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="text-sm tracking-[0.22em] text-stone-500 transition hover:text-stone-900"
        >
          返回首页
        </Link>

        <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.72fr]">
          <div className="rounded-[36px] border border-stone-300 bg-white/75 p-6 shadow-[0_24px_90px_rgba(73,52,42,0.08)] md:p-8">
            <p className="text-xs tracking-[0.3em] text-stone-500">{record.sourceLabel}</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-stone-950">
              {record.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">
              {record.summary}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {record.keywords.length > 0 ? (
                record.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600"
                  >
                    {keyword}
                  </span>
                ))
              ) : (
                <span className="text-sm text-stone-500">暂无关键词</span>
              )}
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                <p className="text-xs tracking-[0.24em] text-stone-500">行动项</p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                  {record.actionItems.length > 0 ? (
                    record.actionItems.map((item) => <p key={item}>- {item}</p>)
                  ) : (
                    <p>当前没有检测到明确待办。</p>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                <p className="text-xs tracking-[0.24em] text-stone-500">元信息</p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                  <p>入库时间：{formatDateTime(record.createdAt)}</p>
                  <p>资料类型：{record.recordType}</p>
                  <p>附件数量：{record.assets.length}</p>
                </div>
              </div>
            </div>

            {record.contextNote ? (
              <div className="mt-8 rounded-[24px] border border-stone-200 bg-white p-5">
                <p className="text-xs tracking-[0.24em] text-stone-500">手动备注</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {record.contextNote}
                </p>
              </div>
            ) : null}

            {record.contentText ? (
              <div className="mt-8 rounded-[24px] border border-stone-200 bg-white p-5">
                <p className="text-xs tracking-[0.24em] text-stone-500">原始文本</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {record.contentText}
                </p>
              </div>
            ) : null}

            {record.extractedText ? (
              <div className="mt-8 rounded-[24px] border border-stone-200 bg-white p-5">
                <p className="text-xs tracking-[0.24em] text-stone-500">抽取文本</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {record.extractedText}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-stone-300 bg-white/75 p-6">
              <p className="text-xs tracking-[0.3em] text-stone-500">同步操作</p>
              <h2 className="mt-2 font-serif text-3xl text-stone-950">
                先预览，再同步
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                先看预览内容，确认没问题后再发到 Notion 或滴答清单。
              </p>

              <div className="mt-6">
                <RecordQuickActions recordId={record.id} />
              </div>

              <div className="mt-6">
                <SyncPreview record={record} />
              </div>
            </div>

            <div className="rounded-[32px] border border-stone-300 bg-white/75 p-6">
              <p className="text-xs tracking-[0.3em] text-stone-500">附件</p>
              <div className="mt-4 space-y-3">
                {record.assets.length > 0 ? (
                  record.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={`/api/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-stone-200 px-4 py-4 transition hover:border-stone-500"
                    >
                      <p className="text-sm font-medium text-stone-800">
                        {asset.originalName}
                      </p>
                      <p className="mt-1 text-xs tracking-[0.22em] text-stone-500">
                        {asset.mimeType} / {Math.max(1, Math.round(asset.byteSize / 1024))} KB
                      </p>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-stone-600">这条资料没有附件。</p>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-stone-300 bg-white/75 p-6">
              <p className="text-xs tracking-[0.3em] text-stone-500">同步历史</p>
              <div className="mt-4 space-y-3">
                {record.syncRuns.length > 0 ? (
                  record.syncRuns.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-stone-200 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-stone-800">
                          {run.target}
                        </p>
                        <span className="text-xs tracking-[0.2em] text-stone-500">
                          {run.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-stone-600">{run.message}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {formatDateTime(run.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-600">还没有同步记录。</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
