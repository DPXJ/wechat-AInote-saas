"use client";

import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
} from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
}

function mergeFiles(current: File[], incoming: File[]) {
  const next = new Map(current.map((file) => [fileKey(file), file]));
  incoming.forEach((file) => next.set(fileKey(file), file));
  return Array.from(next.values());
}

export function InboxForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const attachmentSummary = useMemo(() => {
    if (files.length === 0) {
      return "还没有附件。你可以拖拽文件、点击选择，或者直接粘贴截图。";
    }

    return `已附加 ${files.length} 个文件。提交后会一起入库并建立索引。`;
  }, [files]);

  function attachFiles(incoming: File[], sourceLabel: string) {
    if (incoming.length === 0) {
      return;
    }

    setFiles((current) => mergeFiles(current, incoming));
    setStatus(`${sourceLabel}已附加 ${incoming.length} 个文件。`);
  }

  function removeFile(target: File) {
    setFiles((current) => current.filter((file) => fileKey(file) !== fileKey(target)));
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    attachFiles(selected, "已从文件选择器");
    event.target.value = "";
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    attachFiles(Array.from(event.dataTransfer.files || []), "已从拖拽区");
  }

  function handlePaste(event: ReactClipboardEvent<HTMLFormElement>) {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length === 0) {
      return;
    }

    event.preventDefault();
    attachFiles(pastedFiles, "已从剪贴板");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("正在入库，并为这条资料建立摘要和搜索索引...");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("files");
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/records", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      setStatus(payload.error || "入库失败，请稍后再试。");
      setSubmitting(false);
      return;
    }

    setStatus("资料已入库，正在跳转到详情页。");
    router.push(`/records/${payload.record.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} onPasteCapture={handlePaste} className="space-y-5">
      <div className="rounded-[28px] border border-stone-200 bg-white/75 p-5">
        <p className="text-xs tracking-[0.26em] text-stone-500">最快上手方式</p>
        <div className="mt-3 grid gap-3 text-sm leading-7 text-stone-700 md:grid-cols-3">
          <p>1. 把微信里的文字、截图或文档放进来</p>
          <p>2. 系统自动生成摘要、关键词和可搜索索引</p>
          <p>3. 需要时再同步到 Notion 或滴答清单</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs tracking-[0.26em] text-stone-500">标题</span>
          <input
            name="title"
            placeholder="例如：客户报价截图 / 群通知 / 合同 PDF"
            className="w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs tracking-[0.26em] text-stone-500">来源标签</span>
          <input
            name="sourceLabel"
            defaultValue="微信手动同步"
            className="w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
          />
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-xs tracking-[0.26em] text-stone-500">文本内容</span>
        <textarea
          name="contentText"
          rows={8}
          placeholder="把微信里的文本直接粘贴到这里。如果是图片、PDF、视频，也可以先补一句你对内容的描述。"
          className="w-full rounded-[28px] border border-stone-300 bg-white/80 px-4 py-4 text-sm outline-none transition focus:border-stone-500"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-[1fr_0.95fr]">
        <label className="space-y-2">
          <span className="text-xs tracking-[0.26em] text-stone-500">补充说明</span>
          <textarea
            name="contextNote"
            rows={4}
            placeholder="例如：这是群里今天上午发的 PDF，我担心漏掉里面的截止时间。"
            className="w-full rounded-[24px] border border-stone-300 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
          />
        </label>

        <div className="space-y-2">
          <span className="text-xs tracking-[0.26em] text-stone-500">附件面板</span>
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
              "rounded-[24px] border border-dashed px-4 py-5 transition",
              dragging
                ? "border-stone-900 bg-stone-100"
                : "border-stone-400 bg-white/60",
            ].join(" ")}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.pdf,.docx,image/*,video/*,audio/*"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-stone-800">
                拖拽文件到这里，或者点击下方按钮选择文件
              </p>
              <p className="text-sm leading-7 text-stone-600">
                也支持直接粘贴截图。把光标放在这个页面里，按 <code>Ctrl + V</code>{" "}
                就能附加。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm transition hover:border-stone-700"
                >
                  选择文件
                </button>
                <span className="rounded-full bg-stone-100 px-4 py-2 text-xs text-stone-600">
                  {attachmentSummary}
                </span>
              </div>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {files.map((file) => (
                <button
                  key={fileKey(file)}
                  type="button"
                  onClick={() => removeFile(file)}
                  className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 transition hover:border-stone-700"
                >
                  {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB ×
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-600">
          建议一条信息对应一条记录，后面的搜索和追溯会更干净。
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-stone-950 px-6 py-3 text-sm font-medium text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {submitting ? "处理中..." : "入库并建立索引"}
        </button>
      </div>

      {status ? (
        <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {status}
        </p>
      ) : null}
    </form>
  );
}
