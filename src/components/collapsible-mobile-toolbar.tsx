"use client";

import { useEffect, useState, type ReactNode } from "react";

function useMinWidth(minPx: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minPx}px)`);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [minPx]);
  return matches;
}

/**
 * 窄屏默认收起工具区，展开后显示筛选/输入等；≥breakpoint 与 PC 一致始终展开。
 */
export function CollapsibleMobileToolbar({
  title,
  children,
  className = "",
  /** `lg`≈1024px；`xl`≈1280px（与历史/收藏主从布局断点一致） */
  desktop = "lg",
  mobileBeforeToggle,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  desktop?: "lg" | "xl";
  mobileBeforeToggle?: ReactNode;
}) {
  const minPx = desktop === "xl" ? 1280 : 1024;
  const isDesktop = useMinWidth(minPx);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isDesktop) setOpen(true);
  }, [isDesktop]);

  const toggleRowHidden = desktop === "xl" ? "xl:hidden" : "lg:hidden";
  const desktopAlwaysShow = desktop === "xl" ? "xl:block" : "lg:block";

  return (
    <div className={className}>
      <div className={`mb-2 flex min-h-10 w-full items-center justify-between gap-2 ${toggleRowHidden}`}>
        <div className="min-w-0 text-sm font-semibold text-[var(--foreground)]">{title}</div>
        <div className="flex items-center gap-2">
          {mobileBeforeToggle}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--muted-strong)] transition active:bg-[var(--surface-strong)]"
            aria-expanded={open}
          >
            {open ? "收起" : "展开"}
          </button>
        </div>
      </div>
      <div className={open ? "block" : ["hidden", desktopAlwaysShow].join(" ")}>{children}</div>
    </div>
  );
}
