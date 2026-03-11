"use client";

import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordType, SyncTarget } from "@/lib/types";

type RecordComposerType = Exclude<RecordType, "mixed" | "pdf"> | "pdf";
type StatusTone = "info" | "success" | "error";

const typeConfig: Record<
  RecordComposerType,
  {
    label: string;
    hint: string;
    placeholder?: string;
    accept?: string;
  }
> = {
  text: {
    label: "文本",
    hint: "直接粘贴微信里的文本信息。",
    placeholder: "把微信里的文本直接粘贴到这里，支持快速整理和自动识别待办。",
  },
  image: {
    label: "图片",
    hint: "上传截图、聊天图片、海报。",
    accept: "image/*",
  },
  video: {
    label: "视频",
    hint: "上传录屏、短视频、会议片段。",
    accept: "video/*",
  },
  audio: {
    label: "音频",
    hint: "上传语音、录音、会议音频。",
    accept: "audio/*",
  },
  document: {
    label: "文档",
    hint: "上传 Word、Excel、PPT、Markdown。",
    accept:
      ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json,application/pdf",
  },
  pdf: {
    label: "PDF",
    hint: "上传合同、方案、通知文件。",
    accept: ".pdf,application/pdf",
  },
};

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
}

function mergeFiles(current: File[], incoming: File[]) {
  const next = new Map(current.map((file) => [fileKey(file), file]));
  incoming.forEach((file) => next.set(fileKey(file), file));
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
  if (!items || items.length === 0) {
    return "系统已完成基础分析。";
  }

  const parts: string[] = [];
  const notion = items.find((item) => item.target === "notion");
  const ticktick = items.find((item) => item.target === "ticktick-email");

  if (notion?.status === "synced") {
    parts.push("Notion 已同步");
  } else if (notion?.status === "failed") {
    parts.push("Notion 同步失败");
  }

  if (ticktick?.status === "synced") {
    parts.push("已生成滴答待办");
  } else if (ticktick?.status === "skipped") {
    parts.push("未生成滴答待办");
  } else if (ticktick?.status === "failed") {
    parts.push("滴答待办创建失败");
  }

  return parts.join("，") || "系统已完成基础分析。";
}

export function InboxForm({
  onCreated,
}: {
  onCreated?: (recordId: string) => void;
}) {
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

  const currentType = typeConfig[activeType];
  const isTextMode = activeType === "text";

  const dropzoneTitle = useMemo(() => `上传${currentType.label}附件`, [currentType.label]);

  useEffect(() => {
    if (!status || statusTone === "error") {
      return;
    }

    const timer = window.setTimeout(() => {
      setStatus("");
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [status, statusTone]);

  function updateStatus(message: string, tone: StatusTone = "info") {
    setStatus(message);
    setStatusTone(tone);
  }

  function attachFiles(incoming: File[], sourceText: string) {
    if (incoming.length === 0) {
      return;
    }

    setFiles((current) => mergeFiles(current, incoming));
    updateStatus(`${sourceText}已添加 ${incoming.length} 个附件。`);
  }

  function removeFile(target: File) {
    setFiles((current) => current.filter((file) => fileKey(file) !== fileKey(target)));
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
    if (isTextMode) {
      return;
    }

    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length === 0) {
      return;
    }

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
      updateStatus(`请先上传${currentType.label}附件。`, "error");
      return;
    }

    setSubmitting(true);
    updateStatus("正在收录资料并执行自动同步...", "info");

    const formData = new FormData();
    formData.set("title", title);
    formData.set("sourceLabel", sourceLabel);
    formData.set("contentText", isTextMode ? contentText : "");
    formData.set("contextNote", contextNote);
    formData.set("recordTypeHint", activeType === "pdf" ? "pdf" : activeType);
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/records", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      updateStatus(payload.error || "记录失败，请稍后再试。", "error");
      setSubmitting(false);
      return;
    }

    updateStatus(
      `记录成功。${buildAutoSyncSummary(payload.autoSync)}。`,
      "success",
    );
    setTitle("");
    setContentText("");
    setContextNote("");
    setFiles([]);
    setSubmitting(false);
    onCreated?.(payload.record.id);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} onPasteCapture={handlePaste} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(typeConfig).map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveType(key as RecordComposerType)}
            className={[
              "rounded-full border px-4 py-2 text-sm transition",
              activeType === key
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {value.label}
          </button>
        ))}
        <span className="text-sm text-[var(--muted)]">{currentType.hint}</span>
      </div>

      {isTextMode ? (
        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <textarea
            value={contentText}
            onChange={(event) => setContentText(event.target.value)}
            rows={13}
            placeholder={currentType.placeholder}
            className="h-[42vh] min-h-[320px] max-h-[420px] w-full resize-none rounded-[28px] border-none bg-transparent px-5 py-4 text-[15px] leading-8 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />

          <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={readClipboardText}
                className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)]"
              >
                读取剪贴板文本
              </button>
              <span className="text-sm text-[var(--muted)]">
                用于快速引用刚复制的微信内容。
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? "记录中..." : "确认记录"}
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              setDragging(false);
            }}
            onDrop={handleDrop}
            className={[
              "rounded-[28px] border border-dashed px-6 py-7 text-center transition",
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

            <p className="text-xl font-semibold text-[var(--foreground)]">{dropzoneTitle}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              支持拖拽上传，也支持点击选择文件。图片场景可直接粘贴截图。
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                选择附件
              </button>
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-xs text-[var(--muted-strong)]">
                支持拖拽或粘贴
              </span>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <button
                  key={fileKey(file)}
                  type="button"
                  onClick={() => removeFile(file)}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[var(--line-strong)]"
                >
                  {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB ×
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? "记录中..." : "确认记录"}
            </button>
          </div>
        </section>
      )}

      <details className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--foreground)]">
          更多信息
          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
            标题、来源、备注都可以选填
          </span>
        </summary>
        <div className="grid gap-4 border-t border-[var(--line)] px-4 py-3 lg:grid-cols-2">
          <FieldBlock label="标题">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：客户报价截图 / 文件管理需求纪要 / 合同 PDF"
              className="w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </FieldBlock>
          <FieldBlock label="来源标签">
            <input
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              className="w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </FieldBlock>
          <div className="lg:col-span-2">
            <FieldBlock label="补充说明">
              <textarea
                value={contextNote}
                onChange={(event) => setContextNote(event.target.value)}
                rows={4}
                placeholder="例如：这是今天上午客户群里发的内容，我担心漏掉截止时间和负责人。"
                className="w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </FieldBlock>
          </div>
        </div>
      </details>

      {status ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex justify-end">
          <div
            className={[
              "pointer-events-auto flex max-w-md items-start gap-3 rounded-[18px] px-4 py-3 shadow-[0_20px_40px_rgba(15,23,42,0.18)]",
              statusTone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : statusTone === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-800"
                  : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)]",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1 text-sm leading-6">{status}</div>
            <button
              type="button"
              onClick={() => setStatus("")}
              className="rounded-full px-2 py-1 text-xs opacity-70 transition hover:opacity-100"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      {children}
    </label>
  );
}
