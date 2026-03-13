"use client";

import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordType, SyncTarget } from "@/lib/types";

type RecordComposerType = Exclude<RecordType, "mixed" | "pdf"> | "pdf";
type StatusTone = "info" | "success" | "error";

const typeConfig: Record<
  RecordComposerType,
  { label: string; icon: string; placeholder?: string; accept?: string }
> = {
  text: {
    label: "文本",
    icon: "📝",
    placeholder: "把微信里的文本直接粘贴到这里，支持自动整理和识别待办。",
  },
  image: { label: "图片", icon: "📷", accept: "image/*" },
  video: { label: "视频", icon: "🎬", accept: "video/*" },
  audio: { label: "音频", icon: "🎵", accept: "audio/*" },
  document: {
    label: "文档",
    icon: "📋",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json,application/pdf",
  },
  pdf: { label: "PDF", icon: "📄", accept: ".pdf,application/pdf" },
};

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
}

function mergeFiles(current: File[], incoming: File[]) {
  const next = new Map(current.map((f) => [fileKey(f), f]));
  incoming.forEach((f) => next.set(fileKey(f), f));
  return Array.from(next.values());
}

function buildAutoSyncSummary(
  items:
    | Array<{
        target: SyncTarget;
        status: "synced" | "failed" | "skipped";
        message: string;
      }>
    | undefined,
) {
  if (!items || items.length === 0) return "系统已完成基础分析。";
  const parts: string[] = [];
  const notion = items.find((i) => i.target === "notion");
  const ticktick = items.find((i) => i.target === "ticktick-email");
  if (notion?.status === "synced") parts.push("Notion 已同步");
  else if (notion?.status === "failed") parts.push("Notion 同步失败");
  if (ticktick?.status === "synced") parts.push("已生成滴答待办");
  else if (ticktick?.status === "skipped") parts.push("未生成滴答待办");
  else if (ticktick?.status === "failed") parts.push("滴答待办创建失败");
  return parts.join("，") || "系统已完成基础分析。";
}

export function InboxForm({ onCreated }: { onCreated?: (recordId: string) => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeType, setActiveType] = useState<RecordComposerType>("text");
  const [title, setTitle] = useState("");
  const [sourceLabel, setSourceLabel] = useState("微信手动同步");
  const [contentText, setContentText] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileTags, setFileTags] = useState<Record<string, string>>({});
  const [fileDescs, setFileDescs] = useState<Record<string, string>>({});

  const currentType = typeConfig[activeType];
  const isTextMode = activeType === "text";
  const dropzoneTitle = useMemo(() => `上传${currentType.label}文件`, [currentType.label]);

  useEffect(() => {
    if (!status || statusTone === "error") return;
    const timer = window.setTimeout(() => setStatus(""), 4200);
    return () => window.clearTimeout(timer);
  }, [status, statusTone]);

  function updateStatus(message: string, tone: StatusTone = "info") {
    setStatus(message);
    setStatusTone(tone);
  }

  function attachFiles(incoming: File[], sourceText: string) {
    if (incoming.length === 0) return;
    setFiles((current) => mergeFiles(current, incoming));
    updateStatus(`${sourceText}已添加 ${incoming.length} 个附件。`);
  }

  function removeFile(target: File) {
    setFiles((current) => current.filter((f) => fileKey(f) !== fileKey(target)));
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    attachFiles(selected, "文件选择器");
    event.target.value = "";
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    attachFiles(Array.from(event.dataTransfer.files || []), "拖拽区");
  }

  function handlePaste(event: ReactClipboardEvent<HTMLFormElement>) {
    if (isTextMode) return;
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    attachFiles(pastedFiles, "剪贴板");
  }

  async function readClipboardText() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        updateStatus("剪贴板里没有可读取的文本。", "error");
        return;
      }
      setContentText((current) => (current ? `${current}\n${text}` : text));
      updateStatus("已读取剪贴板文本。", "success");
    } catch {
      updateStatus("读取剪贴板失败，请确认浏览器已授权。", "error");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTextMode && !contentText.trim()) {
      updateStatus("请先粘贴需要记录的文本。", "error");
      return;
    }
    if (!isTextMode && files.length === 0) {
      updateStatus(`请先上传${currentType.label}文件。`, "error");
      return;
    }

    setSubmitting(true);
    updateStatus("正在收录并执行自动同步...", "info");

    const formData = new FormData();
    formData.set("title", title);
    formData.set("sourceLabel", sourceLabel);
    formData.set("contentText", isTextMode ? contentText : "");
    formData.set("contextNote", contextNote);
    formData.set("recordTypeHint", activeType === "pdf" ? "pdf" : activeType);
    files.forEach((file, idx) => {
      formData.append("files", file);
      const fk = fileKey(file);
      formData.set(`fileTags_${idx}`, fileTags[fk] || "");
      formData.set(`fileDesc_${idx}`, fileDescs[fk] || "");
    });

    const response = await fetch("/api/records", { method: "POST", body: formData });
    const payload = await response.json();

    if (!response.ok) {
      updateStatus(payload.error || "记录失败，请稍后再试。", "error");
      setSubmitting(false);
      return;
    }

    updateStatus(`记录成功。${buildAutoSyncSummary(payload.autoSync)}`, "success");
    setTitle("");
    setContentText("");
    setContextNote("");
    setFiles([]);
    setFileTags({});
    setFileDescs({});
    setSubmitting(false);
    onCreated?.(payload.record.id);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} onPasteCapture={handlePaste} className="space-y-5">
      {/* Type selector — large, prominent */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const active = activeType === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveType(key as RecordComposerType)}
              className={[
                "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-medium transition",
                active
                  ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
                  : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Text mode */}
      {isTextMode ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
          <textarea
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            rows={10}
            placeholder={currentType.placeholder}
            className="min-h-[220px] max-h-[400px] w-full resize-none border-none bg-transparent px-5 py-4 text-[15px] leading-8 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />
          <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3">
            <button
              type="button"
              onClick={readClipboardText}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              📋 粘贴剪贴板
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-[var(--background)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "收录中..." : "确认收录"}
            </button>
          </div>
        </div>
      ) : (
        /* File mode */
        <div className="space-y-4">
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={handleDrop}
            className={[
              "rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line-strong)] bg-[var(--surface)]",
            ].join(" ")}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={currentType.accept}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="text-4xl">{currentType.icon}</div>
            <p className="mt-3 text-base font-medium text-[var(--foreground)]">
              {dropzoneTitle}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              拖拽上传或点击选择，图片可直接粘贴
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-xl bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90"
            >
              选择文件
            </button>
          </div>

          {/* File previews */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {files.map((file) => {
                const fk = fileKey(file);
                const isImg = file.type.startsWith("image/");
                return (
                  <div key={fk} className="space-y-1.5">
                    <FilePreviewChip file={file} onRemove={() => removeFile(file)} />
                    {isImg && (
                      <>
                        <input
                          value={fileDescs[fk] || ""}
                          onChange={(e) => setFileDescs((prev) => ({ ...prev, [fk]: e.target.value }))}
                          placeholder="图片描述"
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
                        />
                        <input
                          value={fileTags[fk] || ""}
                          onChange={(e) => setFileTags((prev) => ({ ...prev, [fk]: e.target.value }))}
                          placeholder="标签（逗号分隔）"
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-[var(--background)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "收录中..." : "确认收录"}
            </button>
          </div>
        </div>
      )}

      {/* Optional fields */}
      <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <summary className="cursor-pointer list-none px-5 py-3.5 text-sm text-[var(--muted-strong)]">
          更多信息
          <span className="ml-2 text-xs text-[var(--muted)]">标题、来源、备注</span>
        </summary>
        <div className="grid gap-4 border-t border-[var(--line)] px-5 py-4 lg:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：客户报价截图"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--foreground)]">来源</span>
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-sm font-medium text-[var(--foreground)]">备注</span>
            <textarea
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              rows={3}
              placeholder="例如：客户群里发的内容，担心漏掉截止时间。"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </details>

      {/* Status toast */}
      {status && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50">
          <div
            className={[
              "pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm shadow-lg backdrop-blur",
              statusTone === "success"
                ? "bg-emerald-50 text-emerald-800"
                : statusTone === "error"
                  ? "bg-rose-50 text-rose-800"
                  : "bg-[var(--card)] text-[var(--foreground)]",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1">{status}</span>
            <button
              type="button"
              onClick={() => setStatus("")}
              className="text-xs opacity-40 transition hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function FilePreviewChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  const revoke = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  useEffect(() => revoke, [revoke]);

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const isPdf = file.type === "application/pdf";
  const icon = isPdf ? "📄" : isVideo ? "🎬" : isAudio ? "🎵" : "📎";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
      {isImage && preview ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={preview}
          alt={file.name}
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-[var(--surface)]">
          <span className="text-3xl">{icon}</span>
        </div>
      )}
      <div className="px-3 py-2">
        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">{file.name}</p>
        <p className="text-[11px] text-[var(--muted)]">
          {Math.max(1, Math.round(file.size / 1024))} KB
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
