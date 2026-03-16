"use client";

import { useEffect, useState } from "react";
import {
  getPendingRecordsForSync,
  subscribeSyncStatus,
  syncPendingRecordsToCloud,
} from "@/lib/local-record-store";
import {
  getPendingTodosForSync,
  subscribeTodoSyncStatus,
  syncPendingTodosToCloud,
} from "@/lib/local-todo-store";

export function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [recordsSyncing, setRecordsSyncing] = useState(false);
  const [pendingTodos, setPendingTodos] = useState(0);
  const [todosSyncing, setTodosSyncing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const syncing = recordsSyncing || todosSyncing;

  useEffect(() => {
    const unsubRecords = subscribeSyncStatus((count, syncingState) => {
      setPendingCount(count);
      setRecordsSyncing(syncingState);
    });
    const unsubTodos = subscribeTodoSyncStatus((count, syncingState) => {
      setPendingTodos(count);
      setTodosSyncing(syncingState);
    });
    return () => {
      unsubRecords();
      unsubTodos();
    };
  }, []);

  async function handleSyncNow() {
    const totalPending = pendingCount + pendingTodos;
    if (syncing || totalPending === 0) return;
    setPanelOpen(false);
    setRecordsSyncing(true);
    setTodosSyncing(true);
    try {
      await Promise.all([
        syncPendingRecordsToCloud(),
        syncPendingTodosToCloud(),
      ]);
      const [records, todos] = await Promise.all([
        getPendingRecordsForSync(),
        getPendingTodosForSync(),
      ]);
      setPendingCount(records.length);
      setPendingTodos(todos.length);
    } finally {
      setRecordsSyncing(false);
      setTodosSyncing(false);
    }
  }

  const totalPending = pendingCount + pendingTodos;

  if (totalPending === 0 && !syncing) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        title={syncing ? "同步中…" : `${totalPending} 条待同步`}
      >
        {syncing ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        )}
        <span>{syncing ? "同步中…" : `${totalPending} 条待同步`}</span>
      </button>

      {panelOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPanelOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-lg">
            <p className="text-xs font-medium text-[var(--muted)]">
              {syncing
                ? "正在同步到云端…"
                : `本地有 ${pendingCount} 条记录、${pendingTodos} 条待办等待同步到云端`}
            </p>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="mt-2 w-full rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-xs font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "同步中…" : "立即同步"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
