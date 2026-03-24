"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

const STORAGE_TEXT = "tiptap-editor-last-text-color";
const STORAGE_HL = "tiptap-editor-last-highlight-color";

/** 常见文字色（深色编辑区上可读）——仅在「更多」面板展示 */
const TEXT_PRESETS = ["#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#c084fc"] as const;
/** 常见填充色 */
const HL_PRESETS = ["#fef08a", "#bbf7d0", "#fecaca", "#e9d5ff", "#bfdbfe"] as const;

function normalizeHex(input: string | undefined | null): string {
  if (!input) return "";
  const s = input.trim();
  if (s.startsWith("#")) {
    if (s.length === 7) return s.toLowerCase();
    if (s.length === 4) {
      const r = s[1] ?? "0";
      const g = s[2] ?? "0";
      const b = s[3] ?? "0";
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return "";
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, "0");
    const g = Number(rgb[2]).toString(16).padStart(2, "0");
    const b = Number(rgb[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "";
}

function colorsMatch(a: string | undefined, b: string | undefined): boolean {
  return normalizeHex(a) === normalizeHex(b);
}

function SwatchBtn({
  hex,
  active,
  onClick,
  title,
  children,
}: {
  hex?: string;
  active: boolean;
  onClick: () => void;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[9px] font-semibold transition",
        !hex ? "bg-[var(--surface)]" : "",
        active
          ? "border-[var(--foreground)] ring-1 ring-[var(--foreground)]"
          : "border-[var(--line)] hover:border-[var(--line-strong)]",
      ].join(" ")}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      {children}
    </button>
  );
}

type MoreKind = "text" | "hl";

function MorePanel({
  kind,
  rect,
  editor,
  onClose,
  persistText,
  persistHl,
  panelRef,
}: {
  kind: MoreKind;
  rect: DOMRect;
  editor: Editor;
  onClose: () => void;
  persistText: (hex: string) => void;
  persistHl: (hex: string) => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const presets = kind === "text" ? TEXT_PRESETS : HL_PRESETS;
  const colorState = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      textColor: ed?.getAttributes("textStyle").color as string | undefined,
      hlColor: ed?.getAttributes("highlight").color as string | undefined,
    }),
  });
  const curText = colorState?.textColor;
  const curHl = colorState?.hlColor;

  const left = Math.max(8, Math.min(rect.left, typeof window !== "undefined" ? window.innerWidth - 208 : rect.left));
  const top = rect.bottom + 6;

  const applyText = (hex: string) => {
    editor.chain().focus().setColor(hex).run();
    persistText(hex);
    onClose();
  };
  const applyHl = (hex: string) => {
    editor.chain().focus().setHighlight({ color: hex }).run();
    persistHl(hex);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={kind === "text" ? "文字颜色" : "填充色"}
      className="fixed z-[300] w-[200px] rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-xl"
      style={{ top, left }}
    >
      <p className="mb-2 text-[10px] font-medium text-[var(--muted)]">常用颜色</p>
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {presets.map((hex) => (
          <SwatchBtn
            key={hex}
            hex={hex}
            active={
              kind === "text" ? colorsMatch(curText, hex) : colorsMatch(curHl, hex)
            }
            title={kind === "text" ? `文字：${hex}` : `填充：${hex}`}
            onClick={() => (kind === "text" ? applyText(hex) : applyHl(hex))}
          />
        ))}
      </div>
      <div className="border-t border-[var(--line)] pt-2">
        <p className="mb-1.5 text-[10px] font-medium text-[var(--muted)]">自选颜色</p>
        <button
          type="button"
          onClick={() => pickerRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--line)] px-2 py-2 text-[11px] text-[var(--muted-strong)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          打开取色器…
        </button>
        <input
          ref={pickerRef}
          type="color"
          className="sr-only h-0 w-0"
          aria-hidden
          onChange={(e) => {
            const hex = e.target.value;
            if (kind === "text") {
              editor.chain().focus().setColor(hex).run();
              persistText(hex);
            } else {
              editor.chain().focus().setHighlight({ color: hex }).run();
              persistHl(hex);
            }
            onClose();
          }}
        />
      </div>
    </div>
  );
}

export function TiptapColorHighlightControls({ editor }: { editor: Editor | null }) {
  const textMoreRef = useRef<HTMLButtonElement>(null);
  const hlMoreRef = useRef<HTMLButtonElement>(null);
  const recentTextPlaceholderRef = useRef<HTMLButtonElement>(null);
  const recentHlPlaceholderRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [lastText, setLastText] = useState("");
  const [lastHl, setLastHl] = useState("");
  const [moreOpen, setMoreOpen] = useState<MoreKind | null>(null);
  const [panelRect, setPanelRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    try {
      /* eslint-disable react-hooks/set-state-in-effect -- 挂载后从 localStorage 同步「上次自定义颜色」 */
      setLastText(localStorage.getItem(STORAGE_TEXT) || "");
      setLastHl(localStorage.getItem(STORAGE_HL) || "");
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore
    }
  }, []);

  const colorState = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) {
        return { textColor: undefined as string | undefined, hlColor: undefined as string | undefined };
      }
      return {
        textColor: ed.getAttributes("textStyle").color as string | undefined,
        hlColor: ed.getAttributes("highlight").color as string | undefined,
      };
    },
  });

  const persistText = useCallback((hex: string) => {
    setLastText(hex);
    try {
      localStorage.setItem(STORAGE_TEXT, hex);
    } catch {
      // ignore
    }
  }, []);

  const persistHl = useCallback((hex: string) => {
    setLastHl(hex);
    try {
      localStorage.setItem(STORAGE_HL, hex);
    } catch {
      // ignore
    }
  }, []);

  const openMore = useCallback((kind: MoreKind, anchor: HTMLElement | null) => {
    if (!anchor) return;
    setPanelRect(anchor.getBoundingClientRect());
    setMoreOpen(kind);
  }, []);

  useLayoutEffect(() => {
    if (!moreOpen) return;
    const anchor =
      moreOpen === "text" ? textMoreRef.current : hlMoreRef.current;
    if (anchor) setPanelRect(anchor.getBoundingClientRect());
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (textMoreRef.current?.contains(t)) return;
      if (hlMoreRef.current?.contains(t)) return;
      if (recentTextPlaceholderRef.current?.contains(t)) return;
      if (recentHlPlaceholderRef.current?.contains(t)) return;
      setMoreOpen(null);
    };
    const onScroll = () => setMoreOpen(null);
    const onResize = () => setMoreOpen(null);
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [moreOpen]);

  if (!editor || !colorState) return null;

  const curText = colorState.textColor;
  const curHl = colorState.hlColor;
  const textUnset = !normalizeHex(curText);
  const hlUnset = !normalizeHex(curHl);

  const lastTextNorm = normalizeHex(lastText);
  const lastHlNorm = normalizeHex(lastHl);
  const hasRecentText = Boolean(lastTextNorm);
  const hasRecentHl = Boolean(lastHlNorm);

  const textRecentActive = hasRecentText && colorsMatch(curText, lastTextNorm);
  const hlRecentActive = hasRecentHl && colorsMatch(curHl, lastHlNorm);

  /** 当前选区颜色不是默认，且与「最近」槽不一致时，提示在「更多」里 */
  const showTextMoreDot = !textUnset && !textRecentActive;
  const showHlMoreDot = !hlUnset && !hlRecentActive;

  return (
    <>
      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-[var(--muted)]">字色</span>
          <SwatchBtn
            active={textUnset}
            onClick={() => editor.chain().focus().unsetColor().run()}
            title="默认文字颜色"
          >
            <span className="text-[var(--foreground)]">A</span>
          </SwatchBtn>
          {hasRecentText ? (
            <SwatchBtn
              hex={lastTextNorm}
              active={textRecentActive}
              title={`最近：${lastTextNorm}`}
              onClick={() => editor.chain().focus().setColor(lastTextNorm).run()}
            />
          ) : (
            <button
              ref={recentTextPlaceholderRef}
              type="button"
              title="尚无最近颜色，点「更多」选择后会记住"
              onClick={() => openMore("text", recentTextPlaceholderRef.current)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-[var(--line)] text-[8px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
            >
              ·
            </button>
          )}
          <button
            ref={textMoreRef}
            type="button"
            title="更多文字颜色（常用色 + 自选，将记住为「最近」）"
            onClick={() => openMore("text", textMoreRef.current)}
            className={[
              "relative flex h-5 min-w-[28px] shrink-0 items-center justify-center rounded border px-1 text-[10px] transition",
              showTextMoreDot
                ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/5 text-[var(--foreground)]"
                : "border-dashed border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            更多
            {showTextMoreDot ? (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-[var(--muted)]">填充</span>
          <SwatchBtn
            active={hlUnset}
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            title="无填充色"
          >
            <span className="leading-none text-[8px] text-[var(--muted)]">无</span>
          </SwatchBtn>
          {hasRecentHl ? (
            <SwatchBtn
              hex={lastHlNorm}
              active={hlRecentActive}
              title={`最近填充：${lastHlNorm}`}
              onClick={() => editor.chain().focus().setHighlight({ color: lastHlNorm }).run()}
            />
          ) : (
            <button
              ref={recentHlPlaceholderRef}
              type="button"
              title="尚无最近填充色，点「更多」选择后会记住"
              onClick={() => openMore("hl", recentHlPlaceholderRef.current)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-[var(--line)] text-[8px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
            >
              ·
            </button>
          )}
          <button
            ref={hlMoreRef}
            type="button"
            title="更多填充色（常用色 + 自选，将记住为「最近」）"
            onClick={() => openMore("hl", hlMoreRef.current)}
            className={[
              "relative flex h-5 min-w-[28px] shrink-0 items-center justify-center rounded border px-1 text-[10px] transition",
              showHlMoreDot
                ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/5 text-[var(--foreground)]"
                : "border-dashed border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            更多
            {showHlMoreDot ? (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>
        </div>
      </div>

      {moreOpen &&
        panelRect &&
        typeof document !== "undefined" &&
        createPortal(
          <MorePanel
            kind={moreOpen}
            rect={panelRect}
            editor={editor}
            onClose={() => setMoreOpen(null)}
            persistText={persistText}
            persistHl={persistHl}
            panelRef={panelRef}
          />,
          document.body,
        )}
    </>
  );
}
