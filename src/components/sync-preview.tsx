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
    body: buildRecordBody(record, 1600),
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
      buildRecordBody(record, 2200),
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
    <section className="grid gap-4 lg:grid-cols-2">
      <PreviewBlock
        title="Notion 预览"
        header={notionPreview.title}
        meta={notionPreview.highlights}
        body={notionPreview.body}
        compact={compact}
      />
      <PreviewBlock
        title="滴答清单预览"
        header={tickTickPreview.subject}
        meta={["会以邮件正文方式发送到滴答清单收件邮箱。"]}
        body={tickTickPreview.body}
        compact={compact}
      />
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
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4">
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      <p className="mt-3 text-sm text-[var(--muted-strong)]">{header}</p>
      <div className="mt-3 space-y-1 text-xs leading-6 text-[var(--muted)]">
        {meta.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <pre
        className={[
          "mt-4 overflow-hidden whitespace-pre-wrap rounded-[16px] bg-[var(--surface)] px-3 py-3 text-xs leading-6 text-[var(--muted-strong)]",
          compact ? "max-h-40" : "max-h-56",
        ].join(" ")}
      >
        {body || "暂无正文内容。"}
      </pre>
    </div>
  );
}
