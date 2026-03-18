"use client";

import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  FormEvent,
} from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import {
  addPendingRecord,
  syncPendingRecordsToCloud,
  type PendingRecordPayload,
} from "@/lib/local-record-store";

type StatusTone = "info" | "success" | "error";

const FILE_ACCEPT_ALL =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json,application/pdf";

const DEFAULT_TAG_KEY = "ai-box-default-tag";

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
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [sourceLabel, setSourceLabel] = useState("微信手动同步");
  const [contentText, setContentText] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [userTags, setUserTags] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileTags, setFileTags] = useState<Record<string, string>>({});
  const [fileDescs, setFileDescs] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [enableAiSummary, setEnableAiSummary] = useState(true);
  const [enableAiTodo, setEnableAiTodo] = useState(true);
  const [linkToTodo, setLinkToTodo] = useState(false);
  const [syncToFlomo, setSyncToFlomo] = useState(false);
  const [recentTags, setRecentTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [defaultTag, setDefaultTagState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(DEFAULT_TAG_KEY) || "";
  });

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setRecentTags((d.tags || []).slice(0, 3)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (defaultTag && !userTags) {
      setUserTags(defaultTag);
    }
  }, []);

  function setDefaultTag(tag: string) {
    if (tag) {
      window.localStorage.setItem(DEFAULT_TAG_KEY, tag);
      setDefaultTagState(tag);
    } else {
      window.localStorage.removeItem(DEFAULT_TAG_KEY);
      setDefaultTagState("");
    }
  }

  function addTag(tag: string) {
    const current = userTags.split(/\s+/).filter(Boolean);
    if (current.includes(tag)) return;
    setUserTags([...current, tag].join(" "));
  }

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

  function handlePaste(event: ReactClipboardEvent<HTMLFormElement>) {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (pastedFiles.length === 0) return;
    const images = pastedFiles.filter((f) => f.type.startsWith("image/"));
    if (images.length > 0) {
      attachFiles(images, "剪贴板");
    }
  }

  async function readClipboardText() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        updateStatus("剪贴板里没有可读取的文本。", "error");
        return;
      }
      if (editor) {
        editor.chain().focus().insertContent(text).run();
      } else {
        setContentText((current) => (current ? `${current}\n${text}` : text));
      }
      updateStatus("已读取剪贴板文本。", "success");
    } catch {
      updateStatus("读取剪贴板失败，请确认浏览器已授权。", "error");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contentText.trim() && files.length === 0) {
      updateStatus("请输入文本或添加附件。", "error");
      return;
    }

    setSubmitting(true);
    updateStatus("正在提交...", "info");

    try {
      const filePayloads = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          type: f.type || "application/octet-stream",
          lastModified: f.lastModified,
          content: await f.arrayBuffer(),
        })),
      );
      const payload: PendingRecordPayload = {
        title,
        sourceLabel,
        contentText,
        contextNote,
        userTags,
        recordTypeHint: files.length === 0 ? "text" : "",
        files: filePayloads,
        fileTags: { ...fileTags },
        fileDescs: { ...fileDescs },
        enableAiSummary,
        enableAiTodo,
        linkToTodo,
        syncToFlomo,
      };

      await addPendingRecord(payload);
      setTitle("");
      setContentText("");
      editor?.commands.clearContent(true);
      setContextNote("");
      setUserTags(defaultTag);
      setFiles([]);
      setFileTags({});
      setFileDescs({});
      setSubmitting(false);
      updateStatus("已收录，等待同步到云端", "success");

      syncPendingRecordsToCloud()
        .then(({ synced, failed }) => {
          if (synced > 0) {
            updateStatus(`收录已同步到云端（${synced} 条）`, "success");
            onCreated?.("");
            router.refresh();
          }
          if (failed > 0) updateStatus(`${failed} 条同步失败，可点击右上角云图标重试`, "error");
        })
        .catch(() => updateStatus("同步异常，可稍后点击云图标重试", "error"));
    } catch (e) {
      setSubmitting(false);
      updateStatus(e instanceof Error ? e.message : "提交失败，请重试", "error");
    }
  }

  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

  const onEditorUpdate = useCallback(({ editor: ed }: { editor: ReturnType<typeof useEditor> }) => {
    if (!ed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = (ed.storage as any).markdown.getMarkdown() as string;
    setContentText(md);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "输入文本或 Markdown，支持直接粘贴截图…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: contentText,
    onUpdate: onEditorUpdate,
    editorProps: {
      attributes: {
        class: "prose-custom min-h-[320px] max-h-[600px] overflow-y-auto px-6 py-5 text-[15px] leading-8 text-[var(--foreground)] outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          formRef.current?.requestSubmit();
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onPasteCapture={handlePaste}
      className="space-y-5"
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const dropped = Array.from(e.dataTransfer.files || []); if (dropped.length > 0) attachFiles(dropped, "拖拽"); }}
    >
      {/* Top: Title + AI Search */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="input-focus-bar flex-1 min-w-[120px]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（选填）"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
          </div>
          {onSwitchToSearch && (
            <button
              type="button"
              onClick={onSwitchToSearch}
              className="ai-border flex shrink-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-left transition"
            >
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
                <circle cx="8" cy="8" r="5.5" /><path d="M12 12l4 4" />
              </svg>
              <span className="text-sm text-[var(--muted)]">AI 搜索</span>
            </button>
          )}
        </div>
        {/* Tags row - below title, same width */}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 min-w-[120px] items-center gap-2">
            {defaultTag && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-purple-500/10 px-2.5 py-1.5 text-xs text-purple-600">
                <span className="text-[var(--muted)]">默认</span>
                <button type="button" onClick={() => addTag(defaultTag)} className="font-medium hover:underline">{defaultTag}</button>
                <button type="button" onClick={() => setDefaultTag("")} className="rounded p-0.5 hover:bg-purple-500/20" title="取消默认">×</button>
              </span>
            )}
            <div className="input-focus-bar flex-1">
              <input
                value={userTags}
                onChange={(e) => setUserTags(e.target.value)}
                placeholder="标签（空格分隔，选填）"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
            </div>
            {recentTags.filter(({ tag }) => tag !== defaultTag).map(({ tag }) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                onContextMenu={(e) => { e.preventDefault(); setDefaultTag(tag); }}
                className="shrink-0 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
                title="点击添加，右键设为默认"
              >
                {tag}
              </button>
            ))}
            {!defaultTag && (
              <button
                type="button"
                onClick={() => {
                  const v = window.prompt("输入默认标签（新建记录时自动填入）");
                  if (v?.trim()) setDefaultTag(v.trim());
                }}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                +默认
              </button>
            )}
          </div>
          {onSwitchToSearch && <div className="w-[99px] shrink-0" />}
        </div>
      </div>

      {/* Main content area */}
      <div
        className={[
          "input-focus-bar overflow-hidden rounded-3xl border shadow-sm transition",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line-strong)] bg-[var(--surface)]",
        ].join(" ")}
      >
        {/* Formatting toolbar */}
        {editor && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5">
            <FmtBtn
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="标题 1"
            >
              H1
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="标题 2"
            >
              H2
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="标题 3"
            >
              H3
            </FmtBtn>
            <span className="mx-1 h-4 w-px bg-[var(--line)]" />
            <FmtBtn
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="加粗"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="斜体"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="删除线"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><path d="M17.5 7.5c0-2-1.5-3.5-5.5-3.5S6 5 6 7.5c0 4 12 2 12 7.5 0 2.5-2.5 4-6 4s-6-1.5-6-4"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="行内代码"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </FmtBtn>
            <span className="mx-1 h-4 w-px bg-[var(--line)]" />
            <FmtBtn
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="无序列表"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="有序列表"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="任务列表"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 6.5"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="引用"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
            </FmtBtn>
            <span className="mx-1 h-4 w-px bg-[var(--line)]" />
            <FmtBtn
              active={false}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="分割线"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="12" x2="22" y2="12"/></svg>
            </FmtBtn>
            <FmtBtn
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              title="代码块"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 8 5 12 9 16"/><polyline points="15 8 19 12 15 16"/></svg>
            </FmtBtn>
          </div>
        )}

        <EditorContent editor={editor} />

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

        {/* Toolbar + Attachment area */}
        <div className="border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={readClipboardText}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              粘贴文本
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT_ALL}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              添加附件
            </button>
          </div>

          {/* Attachment drop zone - compact, always visible */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={[
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition",
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line)] bg-[var(--card)]/50 hover:border-[var(--line-strong)]",
            ].join(" ")}
          >
            <span className="text-2xl">📎</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {files.length > 0 ? `已添加 ${files.length} 个文件` : "拖拽或点击添加附件（图片、视频、音频、文档等）"}
              </p>
              <p className="text-xs text-[var(--muted)]">支持 JPG、PNG、PDF、Word、Excel、MP4、MP3 等</p>
            </div>
          </div>

          {/* Attachment preview grid */}
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
                          placeholder="标签（空格分隔）"
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit row: AI options + 提交记录 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted-strong)]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableAiSummary}
                  onChange={(e) => setEnableAiSummary(e.target.checked)}
                  className="rounded border-[var(--line)]"
                />
                <span>AI 识别摘要</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableAiTodo}
                  onChange={(e) => setEnableAiTodo(e.target.checked)}
                  className="rounded border-[var(--line)]"
                />
                <span>AI 识别待办</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={linkToTodo}
                  onChange={(e) => setLinkToTodo(e.target.checked)}
                  className="rounded border-[var(--line)]"
                />
                <span>关联待办</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={syncToFlomo}
                  onChange={(e) => setSyncToFlomo(e.target.checked)}
                  className="rounded border-[var(--line)]"
                />
                <span>同步到 flomo</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-[var(--background)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title="Ctrl+Enter 快捷提交"
            >
              {submitting ? "提交中..." : "提交记录"}
            </button>
          </div>
        </div>
      </div>

      {dragging && (
        <p className="text-center text-sm text-[var(--accent)]">松开以添加文件</p>
      )}

      {/* 更多信息（来源、备注） */}
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)]">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-[var(--muted-strong)] transition hover:text-[var(--foreground)]"
        >
          <span>
            更多信息
            <span className="ml-2 text-xs text-[var(--muted)]">来源、备注</span>
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
        <div
          className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "pointer-events-auto flex animate-toast-in items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-xl backdrop-blur-md",
              statusTone === "success"
                ? "border-emerald-500/30 bg-emerald-500/95 text-white dark:bg-emerald-600/95"
                : statusTone === "error"
                  ? "border-rose-500/30 bg-rose-500/95 text-white dark:bg-rose-600/95"
                  : "border-[var(--line-strong)] bg-[var(--card)]/95 text-[var(--foreground)]",
            ].join(" ")}
          >
            {statusTone === "info" && (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {statusTone === "success" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
            {statusTone === "error" && (
              <span className="shrink-0 text-base leading-none">!</span>
            )}
            <span className="min-w-0 flex-1">{status}</span>
            <button
              type="button"
              onClick={() => setStatus("")}
              className="-mr-1 rounded-lg p-1 opacity-70 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="关闭"
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

  useEffect(() => {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

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

function FmtBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "flex items-center justify-center rounded px-1.5 py-1 text-xs font-semibold transition",
        active
          ? "bg-[var(--foreground)]/10 text-[var(--foreground)]"
          : "text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
