"use client";

import { useCallback, useEffect, useState } from "react";
import { AssetGallery } from "@/components/asset-gallery";
import { RecordQuickActions } from "@/components/record-quick-actions";
import { SyncPreview } from "@/components/sync-preview";
import { sanitizeSummary } from "@/lib/ai";
import type { KnowledgeRecord, RecordAsset, RecordType, SyncRun } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const recordTypeLabels: Record<RecordType, string> = {
  text: "文本", image: "图片", pdf: "PDF", document: "文档", audio: "音频", video: "视频", mixed: "混合",
};
const recordTypeIcons: Record<RecordType, string> = {
  text: "📝", image: "📷", pdf: "📄", document: "📋", audio: "🎵", video: "🎬", mixed: "📦",
};
const syncTargetLabels: Record<SyncRun["target"], string> = {
  notion: "Notion", "ticktick-email": "滴答清单", "feishu-doc": "飞书文档", flomo: "flomo",
};
const syncStatusStyles: Record<SyncRun["status"], { label: string; dot: string }> = {
  pending: { label: "处理中", dot: "bg-amber-400" },
  synced: { label: "已同步", dot: "bg-emerald-400" },
  failed: { label: "失败", dot: "bg-rose-400" },
};

export function RecordDetailModal({
  recordId,
  onClose,
  onDelete,
  onUpdate,
}: {
  recordId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string }) => void;
}) {
  const [record, setRecord] = useState<KnowledgeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editContentText, setEditContentText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRecord = useCallback(async () => {
    const res = await fetch(`/api/records/${recordId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setRecord(data.record);
    setEditTitle(data.record.title);
    setEditSource(data.record.sourceLabel);
    setEditNote(data.record.contextNote);
    setEditContentText(data.record.contentText || data.record.extractedText || "");
    setLoading(false);
  }, [recordId]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    if (!record) return;
    setSaving(true);
    const fields: Record<string, string> = {};
    if (editTitle !== record.title) fields.title = editTitle;
    if (editSource !== record.sourceLabel) fields.sourceLabel = editSource;
    if (editNote !== record.contextNote) fields.contextNote = editNote;
    const origText = record.contentText || record.extractedText || "";
    if (editContentText !== origText) fields.contentText = editContentText;
    if (Object.keys(fields).length > 0) {
      const merged = { ...record, ...fields };
      setRecord(merged);
      onUpdate(record.id, fields);
    }
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--background)] shadow-2xl">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-3">
          <span className="text-sm font-medium text-[var(--muted-strong)]">记录详情</span>
          <div className="flex items-center gap-2">
            {record && !editing && (
              <>
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)]">
                  ✎ 编辑
                </button>
                <button type="button" onClick={() => onDelete(record.id)} className="rounded-lg px-3 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10">
                  删除
                </button>
              </>
            )}
            {record && editing && (
              <>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface)]">
                  取消
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1.5 text-lg text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <svg className="h-8 w-8 animate-spin text-[var(--muted)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!loading && !record && (
            <p className="py-20 text-center text-sm text-[var(--muted)]">资料不存在</p>
          )}

          {record && (
            <div className="space-y-6">
              {/* Meta */}
              <section>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--muted)]">
                  <span>{recordTypeIcons[record.recordType]}</span>
                  {editing ? (
                    <input value={editSource} onChange={(e) => setEditSource(e.target.value)} className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--foreground)]" placeholder="来源" />
                  ) : (
                    <span>{record.sourceLabel}</span>
                  )}
                  <span className="text-[var(--line-strong)]">·</span>
                  <span>{recordTypeLabels[record.recordType]}</span>
                  <span className="text-[var(--line-strong)]">·</span>
                  <span>{formatDateTime(record.createdAt)}</span>
                  {record.assets.length > 0 && (
                    <>
                      <span className="text-[var(--line-strong)]">·</span>
                      <span>{record.assets.length} 个附件</span>
                    </>
                  )}
                </div>

                {editing ? (
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-2xl font-bold text-[var(--foreground)]" placeholder="标题" />
                ) : (
                  <h2 className="mt-3 text-2xl font-bold leading-snug text-[var(--foreground)]">{record.title}</h2>
                )}

                <p className="mt-3 text-[15px] leading-8 text-[var(--muted-strong)] whitespace-pre-line">
                {sanitizeSummary(record.summary)}
              </p>

                {record.keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {record.keywords.map((kw) => (
                      <span key={kw} className="rounded-md bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted-strong)]">{kw}</span>
                    ))}
                  </div>
                )}
              </section>

              {/* Quick actions */}
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
                <RecordQuickActions recordId={record.id} />
              </section>

              {/* Action items */}
              {record.actionItems.length > 0 && (
                <section className="rounded-2xl bg-[var(--surface)] px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">行动项</p>
                  <ul className="space-y-2">
                    {record.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-[15px] text-[var(--foreground)]">
                        <span className="mt-0.5 text-[var(--muted-strong)]">•</span>{item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Context note */}
              {editing ? (
                <section className="rounded-2xl bg-[var(--surface)] px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">备注</p>
                  <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]" placeholder="备注信息（可选）" />
                </section>
              ) : record.contextNote ? (
                <section className="rounded-2xl bg-[var(--surface)] px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">备注</p>
                  <p className="text-[15px] leading-7 text-[var(--muted-strong)]">{record.contextNote}</p>
                </section>
              ) : null}

              {/* 文本内容 / 原始文本 */}
              {(record.contentText || record.extractedText || editing) && (
                <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">文本内容</p>
                  {editing ? (
                    <textarea
                      value={editContentText}
                      onChange={(e) => setEditContentText(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                      placeholder="输入或编辑文本内容…"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--muted-strong)]">{record.contentText || record.extractedText || "—"}</p>
                  )}
                </section>
              )}
              {/* 抽取文本：当同时存在 contentText 和 extractedText 时单独展示 */}
              {!editing && record.extractedText && record.contentText && record.extractedText !== record.contentText && (
                <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)]">
                  <summary className="px-5 py-3.5 text-sm font-medium text-[var(--muted-strong)]">抽取文本</summary>
                  <div className="border-t border-[var(--line)] px-5 py-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--muted-strong)]">{record.extractedText}</p>
                  </div>
                </details>
              )}

              {/* Sync preview */}
              <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)]">
                <summary className="px-5 py-3.5 text-sm font-medium text-[var(--muted-strong)]">同步预览</summary>
                <div className="border-t border-[var(--line)] p-5">
                  <SyncPreview record={record} compact />
                </div>
              </details>

              {/* Assets */}
              {record.assets.length > 0 && (
                <section>
                  <AssetGallery assets={record.assets} />
                  <div className="mt-4 space-y-3">
                    {record.assets.map((asset) => (
                      <AssetMetaCard key={asset.id} asset={asset} onOcrDone={loadRecord} />
                    ))}
                  </div>
                </section>
              )}

              {/* Sync history */}
              {record.syncRuns.length > 0 && (
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">同步历史 ({record.syncRuns.length})</p>
                  <div className="space-y-2">
                    {record.syncRuns.map((run) => (
                      <div key={run.id} className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">{syncTargetLabels[run.target]}</p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">{formatDateTime(run.createdAt)}</p>
                          {run.message && <p className="mt-1 text-xs text-[var(--muted-strong)]">{run.message}</p>}
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--muted-strong)]">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncStatusStyles[run.status].dot}`} />
                          {syncStatusStyles[run.status].label}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetMetaCard({ asset, onOcrDone }: { asset: RecordAsset; onOcrDone: () => void }) {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const isImage = asset.mimeType.startsWith("image/");
  const hasOcr = Boolean(asset.ocrText);
  const hasMeta = asset.tags.length > 0 || asset.description || asset.ocrText;

  const handleOcr = async () => {
    setOcrLoading(true);
    setOcrError("");
    try {
      const res = await fetch(`/api/assets/${asset.id}/ocr`, { method: "POST" });
      if (!res.ok) { const data = await res.json(); setOcrError(data.error || "OCR 识别失败"); return; }
      onOcrDone();
    } catch { setOcrError("OCR 请求失败"); }
    finally { setOcrLoading(false); }
  };

  return (
    <div className="rounded-xl bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--foreground)]">{asset.originalName}</p>
        {isImage && (
          <button type="button" onClick={handleOcr} disabled={ocrLoading}
            className={hasOcr
              ? "rounded-lg border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--card)] disabled:opacity-50"
              : "rounded-lg bg-[var(--foreground)] px-3 py-1 text-xs font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
            }>
            {ocrLoading ? "识别中..." : hasOcr ? "🔄 重新识别" : "🔍 OCR 识别"}
          </button>
        )}
      </div>
      {ocrError && <p className="mt-1.5 text-xs text-rose-500">{ocrError}</p>}
      {asset.description && (
        <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
          <span className="font-medium text-[var(--foreground)]">描述：</span>{asset.description}
        </p>
      )}
      {asset.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {asset.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--muted-strong)]">{tag}</span>
          ))}
        </div>
      )}
      {asset.ocrText && (
        <details className="mt-2" open>
          <summary className="text-xs font-medium text-[var(--muted)]">OCR 识别文本</summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--card)] px-3 py-2 text-xs leading-5 text-[var(--muted-strong)]">{asset.ocrText}</p>
        </details>
      )}
      {!hasMeta && !isImage && <p className="mt-1 text-xs text-[var(--muted)]">无附加信息</p>}
    </div>
  );
}
