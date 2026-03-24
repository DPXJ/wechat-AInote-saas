"use client";

import { useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { TiptapColorHighlightControls } from "@/components/tiptap-color-controls";

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

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Type text or Markdown...",
  minHeight = "min-h-[320px]",
  className = "",
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}) {
  const onEditorUpdate = useCallback(
    ({ editor: ed }: { editor: ReturnType<typeof useEditor> }) => {
      if (!ed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = ((ed.storage as any).markdown?.getMarkdown() as string) ?? "";
      onChange(md);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    onUpdate: onEditorUpdate,
    editorProps: {
      attributes: {
        class: `prose-custom max-h-[600px] overflow-y-auto px-6 py-5 text-[15px] leading-8 text-[var(--foreground)] outline-none ${minHeight}`,
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = ((editor.storage as any).markdown?.getMarkdown() as string) ?? "";
    if (value !== current) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {editor && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-0.5 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5">
          <FmtBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="标题 1">H1</FmtBtn>
          <FmtBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题 2">H2</FmtBtn>
          <FmtBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="标题 3">H3</FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="4" y1="12" x2="20" y2="12"/><path d="M17.5 7.5c0-2-1.5-3.5-5.5-3.5S6 5 6 7.5c0 4 12 2 12 7.5 0 2.5-2.5 4-6 4s-6-1.5-6-4"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 6.5"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
          </FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="12" x2="22" y2="12"/></svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="代码块">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 8 5 12 9 16"/><polyline points="15 8 19 12 15 16"/></svg>
          </FmtBtn>
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-y-1">
            <TiptapColorHighlightControls editor={editor} />
          </div>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
