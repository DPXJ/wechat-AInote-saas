import Link from "next/link";
import { RecordQuickActions } from "@/components/record-quick-actions";
import { SyncPreview } from "@/components/sync-preview";
import type { KnowledgeRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function RecordCard({ record }: { record: KnowledgeRecord }) {
  return (
    <article className="group rounded-[28px] border border-stone-300 bg-white/80 p-5 transition hover:-translate-y-1 hover:border-stone-500">
      <Link href={`/records/${record.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
              {record.sourceLabel}
            </p>
            <h3 className="mt-2 text-xl font-medium text-stone-900">
              {record.title}
            </h3>
          </div>
          <span className="rounded-full border border-stone-300 px-3 py-1 text-xs uppercase tracking-[0.2em] text-stone-600">
            {record.recordType}
          </span>
        </div>

        <p className="mt-4 line-clamp-3 text-sm leading-7 text-stone-700">
          {record.summary}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {record.keywords.slice(0, 4).map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600"
            >
              {keyword}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between text-sm text-stone-500">
          <span>{formatDateTime(record.createdAt)}</span>
          <span>{record.assets.length} 个附件</span>
        </div>
      </Link>

      <RecordQuickActions recordId={record.id} />

      <div className="mt-4">
        <SyncPreview record={record} compact />
      </div>
    </article>
  );
}
