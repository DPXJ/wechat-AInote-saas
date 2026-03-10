import type { KnowledgeRecord } from "@/lib/types";

function buildRecordBody(record: KnowledgeRecord, limit: number) {
  return [record.contentText, record.extractedText, record.contextNote]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, limit);
}

function buildNotionPreview(record: KnowledgeRecord) {
  return {
    title: record.title,
    highlights: [
      `来源：${record.sourceLabel}`,
      `关键词：${record.keywords.join(" / ") || "无"}`,
      `行动项：${record.actionItems.join("；") || "无"}`,
    ],
    body: buildRecordBody(record, 1900),
  };
}

function buildTickTickPreview(record: KnowledgeRecord) {
  const subject = record.actionItems[0]
    ? `[AI Box] ${record.actionItems[0]}`
    : `[AI Box] 跟进 ${record.title}`;

  return {
    subject,
    body: [
      `标题：${record.title}`,
      `来源：${record.sourceLabel}`,
      `摘要：${record.summary}`,
      `行动项：${record.actionItems.join("；") || "请人工确认"}`,
      "",
      "原始上下文：",
      buildRecordBody(record, 2500),
    ].join("\n"),
  };
}

export function SyncPreview({
  record,
  compact = false,
}: {
  record: KnowledgeRecord;
  compact?: boolean;
}) {
  const notionPreview = buildNotionPreview(record);
  const tickTickPreview = buildTickTickPreview(record);

  return (
    <section className="rounded-[28px] border border-stone-200 bg-stone-50/90 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.24em] text-stone-500">同步预览</p>
          <h3 className="mt-2 font-serif text-2xl text-stone-950">发出去之前先看看</h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-600">
          {record.title}
        </span>
      </div>

      <div
        className={[
          "mt-5 grid gap-4",
          compact ? "lg:grid-cols-1" : "lg:grid-cols-2",
        ].join(" ")}
      >
        <PreviewBlock
          title="Notion 页面"
          header={notionPreview.title}
          meta={notionPreview.highlights}
          body={notionPreview.body}
          compact={compact}
        />
        <PreviewBlock
          title="滴答任务邮件"
          header={tickTickPreview.subject}
          meta={["会以邮件正文形式发送到滴答清单收件邮箱。"]}
          body={tickTickPreview.body}
          compact={compact}
        />
      </div>
    </section>
  );
}

function PreviewBlock({
  title,
  header,
  meta,
  body,
  compact,
}: {
  title: string;
  header: string;
  meta: string[];
  body: string;
  compact: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-4">
      <p className="text-xs tracking-[0.24em] text-stone-500">{title}</p>
      <p className="mt-2 text-sm font-medium text-stone-900">{header}</p>
      <div className="mt-3 space-y-1 text-xs leading-6 text-stone-500">
        {meta.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <pre
        className={[
          "mt-4 overflow-hidden whitespace-pre-wrap rounded-2xl bg-stone-50 px-3 py-3 text-xs leading-6 text-stone-700",
          compact ? "max-h-44" : "max-h-64",
        ].join(" ")}
      >
        {body || "暂无正文内容。"}
      </pre>
    </div>
  );
}
