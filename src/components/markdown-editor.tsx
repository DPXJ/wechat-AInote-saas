"use client";

import { useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

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
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
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
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5">
          <FmtBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</FmtBtn>
          <FmtBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</FmtBtn>
          <FmtBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</FmtBtn>
          <FmtBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">I</FmtBtn>
          <FmtBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strike">S</FmtBtn>
          <FmtBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">&lt;&gt;</FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">•</FmtBtn>
          <FmtBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">1.</FmtBtn>
          <FmtBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">[]</FmtBtn>
          <FmtBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">"</FmtBtn>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" />

          <FmtBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">—</FmtBtn>
          <FmtBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">{`{}`}</FmtBtn>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
