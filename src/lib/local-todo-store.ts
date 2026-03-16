import type { TodoPriority, TodoStatus } from "@/lib/types";

const DB_NAME = "ai-box-local-todos";
const STORE_PENDING_TODOS = "pending_todos";
const DB_VERSION = 1;

export type PendingTodoSyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface PendingTodoPayload {
  content: string;
  priority: TodoPriority;
  status: TodoStatus;
}

export interface PendingTodo {
  localId: string;
  syncStatus: PendingTodoSyncStatus;
  createdAt: string;
  payload: PendingTodoPayload;
  serverId?: string;
  errorMessage?: string;
}

function openTodoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PENDING_TODOS)) {
        db.createObjectStore(STORE_PENDING_TODOS, { keyPath: "localId" });
      }
    };
  });
}

export async function addPendingTodo(payload: PendingTodoPayload): Promise<PendingTodo> {
  const db = await openTodoDB();
  const localId = `local_todo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const record: PendingTodo = {
    localId,
    syncStatus: "pending",
    createdAt: new Date().toISOString(),
    payload,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_TODOS, "readwrite");
    const store = tx.objectStore(STORE_PENDING_TODOS);
    const req = store.add(record);
    req.onsuccess = () => {
      db.close();
      resolve(record);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getAllPendingTodos(): Promise<PendingTodo[]> {
  const db = await openTodoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_TODOS, "readonly");
    const req = tx.objectStore(STORE_PENDING_TODOS).getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as PendingTodo[]) || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getPendingTodosForSync(): Promise<PendingTodo[]> {
  const all = await getAllPendingTodos();
  return all.filter((t) => t.syncStatus === "pending" || t.syncStatus === "failed");
}

export async function setPendingTodoStatus(
  localId: string,
  status: PendingTodoSyncStatus,
  serverId?: string,
  errorMessage?: string,
): Promise<void> {
  const db = await openTodoDB();
  const todos = await getAllPendingTodos();
  const todo = todos.find((t) => t.localId === localId);
  if (!todo) {
    db.close();
    return;
  }
  todo.syncStatus = status;
  if (serverId) todo.serverId = serverId;
  if (errorMessage) todo.errorMessage = errorMessage;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_TODOS, "readwrite");
    tx.objectStore(STORE_PENDING_TODOS).put(todo);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function removePendingTodo(localId: string): Promise<void> {
  const db = await openTodoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_TODOS, "readwrite");
    tx.objectStore(STORE_PENDING_TODOS).delete(localId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

type TodoSyncStatusListener = (pendingCount: number, syncing: boolean) => void;

let todoSyncListeners: TodoSyncStatusListener[] = [];
let lastTodoPendingCount = 0;
let lastTodoSyncing = false;

function notifyTodoSyncStatus(pendingCount: number, syncing: boolean) {
  if (pendingCount === lastTodoPendingCount && syncing === lastTodoSyncing) return;
  lastTodoPendingCount = pendingCount;
  lastTodoSyncing = syncing;
  todoSyncListeners.forEach((fn) => fn(pendingCount, syncing));
}

export function subscribeTodoSyncStatus(fn: TodoSyncStatusListener): () => void {
  todoSyncListeners.push(fn);
  getPendingTodosForSync().then((list) => fn(list.length, false));
  return () => {
    todoSyncListeners = todoSyncListeners.filter((l) => l !== fn);
  };
}

export async function syncPendingTodosToCloud(): Promise<{ synced: number; failed: number }> {
  const list = await getPendingTodosForSync();
  let synced = 0;
  let failed = 0;
  for (const todo of list) {
    await setPendingTodoStatus(todo.localId, "syncing");
    const remaining = await getPendingTodosForSync();
    notifyTodoSyncStatus(remaining.length, true);
    try {
      const body = {
        content: todo.payload.content,
        priority: todo.payload.priority,
      };
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        await setPendingTodoStatus(todo.localId, "failed", undefined, data.error || "请求失败");
        failed += 1;
        continue;
      }
      await removePendingTodo(todo.localId);
      synced += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络异常";
      await setPendingTodoStatus(todo.localId, "failed", undefined, msg);
      failed += 1;
    }
  }
  const remaining = await getPendingTodosForSync();
  notifyTodoSyncStatus(remaining.length, false);
  return { synced, failed };
}

