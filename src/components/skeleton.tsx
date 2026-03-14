"use client";

function SkeletonPulse({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--surface)] ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-5 w-2/3" />
        <SkeletonPulse className="h-4 w-16" />
      </div>
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-4/5" />
      <div className="flex gap-2 pt-1">
        <SkeletonPulse className="h-5 w-12 rounded-full" />
        <SkeletonPulse className="h-5 w-14 rounded-full" />
        <SkeletonPulse className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTodoItem() {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-4 space-y-2">
      <div className="flex items-center gap-3">
        <SkeletonPulse className="h-5 w-5 rounded-full" />
        <SkeletonPulse className="h-5 flex-1" />
      </div>
      <div className="flex justify-end gap-2">
        <SkeletonPulse className="h-5 w-16 rounded-full" />
        <SkeletonPulse className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonTodoList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTodoItem key={i} />
      ))}
    </div>
  );
}

export function SkeletonSearchResult() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4 space-y-3">
        <SkeletonPulse className="h-5 w-full" />
        <SkeletonPulse className="h-4 w-3/4" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4 space-y-2">
          <SkeletonPulse className="h-5 w-1/2" />
          <SkeletonPulse className="h-4 w-full" />
          <SkeletonPulse className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetailPane() {
  return (
    <div className="space-y-5 p-6">
      <SkeletonPulse className="h-7 w-2/3" />
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-5/6" />
      <SkeletonPulse className="h-4 w-4/5" />
      <div className="border-t border-dashed border-[var(--line)] my-5" />
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-3/4" />
    </div>
  );
}
