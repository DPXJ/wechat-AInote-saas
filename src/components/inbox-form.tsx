"use client";

import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordType, SyncTarget } from "@/lib/types";

type RecordComposerType = "doc" | "attachment";
type StatusTone = "info" | "success" | "error";

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
}

function mergeFiles(current: File[], incoming: File[]) {
  const next = new Map(current.map((f) => [fileKey(f), f]));
  incoming.forEach((f) => next.set(fileKey(f), f));
  return Array.from(next.values());
}

export function InboxForm({ onCreated, onSwitchToSearch }: { onCreated?: (recordId: string) => void; onSwitchToSearch?: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeType, setActiveType] = useState<RecordComposerType>("doc");
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
  const [userTags, setUserTags] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const isDocMode = activeType === "doc";

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
    updateStatus(`${sourceText}已添加 ${incoming.length} 个文件。`);
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
    const dropped = Array.from(event.dataTransfer.files || []);
    if (isDocMode) {
      const images = dropped.filter((f) => f.type.startsWith("image/"));
      if (images.length > 0) attachFiles(images, "拖拽");
    } else {
      attachFiles(dropped, "拖拽区");
    }
  }

  function handlePaste(event: ReactClipboardEvent<HTMLFormElement>) {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (pastedFiles.length === 0) return;
    if (isDocMode) {
      const images = pastedFiles.filter((f) => f.type.startsWith("image/"));
      if (images.length > 0) {
        attachFiles(images, "剪贴板");
      }
    } else {
      event.preventDefault();
      attachFiles(pastedFiles, "剪贴板");
    }
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
    if (isDocMode && !contentText.trim() && files.length === 0) {
      updateStatus("请输入文本或粘贴图片。", "error");
      return;
    }
    if (!isDocMode && files.length === 0) {
      updateStatus("请先上传附件文件。", "error");
      return;
    }

    setSubmitting(true);
    updateStatus("正在收录...", "info");

    const formData = new FormData();
    formData.set("title", title);
    formData.set("sourceLabel", sourceLabel);
    formData.set("contentText", isDocMode ? contentText : "");
    formData.set("contextNote", contextNote);
    formData.set("recordTypeHint", isDocMode && files.length === 0 ? "text" : "");
    formData.set("userTags", userTags);
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

    updateStatus("收录成功！同步将在后台自动完成。", "success");
    setTitle("");
    setContentText("");
    setContextNote("");
    setUserTags("");
    setFiles([]);
    setFileTags({});
    setFileDescs({});
    setSubmitting(false);
    onCreated?.(payload.record.id);
    router.refresh();
  }

  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

  return (
    <form onSubmit={onSubmit} onPasteCapture={handlePaste} className="space-y-5">
      {/* Type selector */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveType("doc")}
          className={[
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-medium transition",
            isDocMode
              ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
              : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
          ].join(" ")}
        >
          <span>📝</span>
          <span>文档</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveType("attachment")}
          className={[
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-medium transition",
            !isDocMode
              ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
              : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
          ].join(" ")}
        >
          <span>📎</span>
          <span>附件</span>
        </button>

        {onSwitchToSearch && (
          <button
            type="button"
            onClick={onSwitchToSearch}
            className="ai-border ml-auto flex items-center gap-2 rounded-lg bg-[var(--card)] px-3 py-2 text-left transition"
          >
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
              <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
            </svg>
            <span className="text-xs text-[var(--muted)]">AI 搜索</span>
          </button>
        )}
      </div>

      {/* Document mode */}
      {isDocMode ? (
        <div>
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
              "input-focus-bar overflow-hidden rounded-3xl border shadow-sm transition",
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line-strong)] bg-[var(--surface)]",
            ].join(" ")}
          >
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              rows={10}
              placeholder="输入文本或 Markdown，支持直接粘贴截图…"
              className="min-h-[240px] max-h-[500px] w-full resize-none border-none bg-transparent px-6 py-5 text-[15px] leading-8 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />

            {/* Inline image previews */}
            {imageFiles.length > 0 && (
              <div className="border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3">
                <p className="mb-2 text-[11px] font-medium text-[var(--muted)]">{imageFiles.length} 张图片</p>
                <div className="flex flex-wrap gap-2">
                  {imageFiles.map((file) => (
                    <InlineImagePreview key={fileKey(file)} file={file} onRemove={() => removeFile(file)} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={readClipboardText}
                  className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
                >
                  📋 粘贴文本
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
                >
                  🖼 插入图片
                </button>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-[var(--background)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "收录中..." : "确认收录"}
              </button>
            </div>
          </div>
          {dragging && (
            <p className="mt-2 text-center text-sm text-[var(--accent)]">松开以添加图片</p>
          )}
        </div>
      ) : (
        /* Attachment mode */
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
              "rounded-3xl border-2 border-dashed px-6 py-10 text-center transition",
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line-strong)] bg-[var(--surface)]",
            ].join(" ")}
          >
            <input
              ref={isDocMode ? undefined : fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="text-4xl">📎</div>
            <p className="mt-3 text-base font-medium text-[var(--foreground)]">
              上传附件（图片、视频、音频、文档等）
            </p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              拖拽或点击选择文件，支持图片、视频、音频、文档等
            </p>
            <div className="mx-auto mt-4 max-w-md space-y-1 text-[11px] leading-relaxed text-[var(--muted)]">
              <p>📷 图片：JPG / PNG / GIF / WebP / SVG</p>
              <p>🎬 视频：MP4 / MOV / WebM / AVI（建议 &lt; 100MB）</p>
              <p>🎵 音频：MP3 / WAV / AAC / OGG</p>
              <p>📋 文档：PDF / Word / Excel / PPT / Markdown / TXT / CSV</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-xl bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-[var(--background)] transition hover:opacity-90"
            >
              选择文件
            </button>
          </div>

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
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)]">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-[var(--muted-strong)] transition hover:text-[var(--foreground)]"
        >
          <span>
            更多信息
            <span className="ml-2 text-xs text-[var(--muted)]">标题、来源、标签、备注</span>
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        {moreOpen && (
          <div className="grid gap-4 border-t border-[var(--line)] px-5 py-4 lg:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">标题</span>
              <div className="input-focus-bar">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：客户报价截图"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--foreground)]">来源</span>
              <div className="input-focus-bar">
                <input
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
            </label>
            <label className="block space-y-1.5 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--foreground)]">标签</span>
              <div className="input-focus-bar">
                <input
                  value={userTags}
                  onChange={(e) => setUserTags(e.target.value)}
                  placeholder="用逗号分隔，例如：工作,客户,报价"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
              <p className="text-xs text-[var(--muted)]">自定义标签，方便后续筛选和搜索</p>
            </label>
            <label className="block space-y-1.5 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--foreground)]">备注</span>
              <div className="input-focus-bar">
                <textarea
                  value={contextNote}
                  onChange={(e) => setContextNote(e.target.value)}
                  rows={3}
                  placeholder="例如：客户群里发的内容，担心漏掉截止时间。"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
            </label>
          </div>
        )}
      </div>

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

function InlineImagePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)]">
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt={file.name} className="h-full w-full object-cover" />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
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
