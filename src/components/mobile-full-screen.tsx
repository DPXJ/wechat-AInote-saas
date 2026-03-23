"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 移动端全屏层（挂到 body），用于历史/收藏详情等「二级页」体验，不影响 PC 布局。
 */
export function MobileFullScreenLayer({
  open,
  onClose,
  title,
  children,
  zClass = "z-[80]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  zClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} flex flex-col bg-[var(--background)]`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--card)]/95 px-2 py-2 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-[var(--foreground)] transition hover:bg-[var(--surface)] active:bg-[var(--surface-strong)]"
          aria-label="返回"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">{title}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>,
    document.body,
  );
}
