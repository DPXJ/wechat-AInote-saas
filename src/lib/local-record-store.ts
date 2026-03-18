/**
 * 收录本地优先：待同步记录存 IndexedDB，同步引擎负责上传到云端。
 * 先做收录，后续待办/历史等沿用同一套思路。
 */

const DB_NAME = "ai-box-local";
const STORE_PENDING = "pending_records";
const DB_VERSION = 1;

export type PendingSyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface PendingFilePayload {
  name: string;
  type: string;
  lastModified: number;
  content: ArrayBuffer;
}

export interface PendingRecordPayload {
  title: string;
  sourceLabel: string;
  contentText: string;
  contextNote: string;
  userTags: string;
  recordTypeHint: string;
  files: PendingFilePayload[];
  fileTags: Record<string, string>;
  fileDescs: Record<string, string>;
  enableAiSummary?: boolean;
  enableAiTodo?: boolean;
  linkToTodo?: boolean;
  syncToFlomo?: boolean;
}

export interface PendingRecord {
  localId: string;
  syncStatus: PendingSyncStatus;
  createdAt: string;
  payload: PendingRecordPayload;
  serverId?: string;
  errorMessage?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "localId" });
      }
    };
  });
}

export async function addPendingRecord(payload: PendingRecordPayload): Promise<PendingRecord> {
  const db = await openDB();
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const record: PendingRecord = {
    localId,
    syncStatus: "pending",
    createdAt: new Date().toISOString(),
    payload,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
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

export async function getAllPendingRecords(): Promise<PendingRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readonly");
    const req = tx.objectStore(STORE_PENDING).getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as PendingRecord[]) || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getPendingRecordsForSync(): Promise<PendingRecord[]> {
  const all = await getAllPendingRecords();
  return all.filter((r) => r.syncStatus === "pending" || r.syncStatus === "failed");
}

export async function setPendingRecordStatus(
  localId: string,
  status: PendingSyncStatus,
  serverId?: string,
  errorMessage?: string,
): Promise<void> {
  const db = await openDB();
  const records = await getAllPendingRecords();
  const record = records.find((r) => r.localId === localId);
  if (!record) {
    db.close();
    return;
  }
  record.syncStatus = status;
  if (serverId) record.serverId = serverId;
  if (errorMessage) record.errorMessage = errorMessage;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    tx.objectStore(STORE_PENDING).put(record);
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

export async function removePendingRecord(localId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    tx.objectStore(STORE_PENDING).delete(localId);
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

/** 构建可提交的 FormData（用于 POST /api/records） */
export function buildFormDataFromPending(pending: PendingRecord): FormData {
  const { payload } = pending;
  const formData = new FormData();
  formData.set("title", payload.title);
  formData.set("sourceLabel", payload.sourceLabel);
  formData.set("contentText", payload.contentText);
  formData.set("contextNote", payload.contextNote);
  formData.set("userTags", payload.userTags);
  formData.set("recordTypeHint", payload.recordTypeHint);
  formData.set("enableAiSummary", String(payload.enableAiSummary !== false));
  formData.set("enableAiTodo", String(payload.enableAiTodo !== false));
  formData.set("linkToTodo", String(payload.linkToTodo === true));
  formData.set("syncToFlomo", String(payload.syncToFlomo === true));
  payload.files.forEach((file, idx) => {
    const blob = new Blob([file.content], { type: file.type || "application/octet-stream" });
    formData.append("files", blob, file.name);
    const fk = `${file.name}-${file.content.byteLength}-${file.lastModified}-${file.type}`;
    formData.set(`fileTags_${idx}`, payload.fileTags[fk] || "");
    formData.set(`fileDesc_${idx}`, payload.fileDescs[fk] || "");
  });
  return formData;
}

type SyncStatusListener = (pendingCount: number, syncing: boolean) => void;

let syncStatusListeners: SyncStatusListener[] = [];
let lastPendingCount = 0;
let lastSyncing = false;

function notifySyncStatus(pendingCount: number, syncing: boolean) {
  if (pendingCount === lastPendingCount && syncing === lastSyncing) return;
  lastPendingCount = pendingCount;
  lastSyncing = syncing;
  syncStatusListeners.forEach((fn) => fn(pendingCount, syncing));
}

export function subscribeSyncStatus(fn: SyncStatusListener): () => void {
  syncStatusListeners.push(fn);
  getPendingRecordsForSync().then((list) => fn(list.length, false));
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== fn);
  };
}

/** 同步所有待同步记录到云端 */
export async function syncPendingRecordsToCloud(
  onProgress?: (localId: string, status: "syncing" | "synced" | "failed") => void,
): Promise<{ synced: number; failed: number }> {
  const list = await getPendingRecordsForSync();
  let synced = 0;
  let failed = 0;
  for (const record of list) {
    await setPendingRecordStatus(record.localId, "syncing");
    const remaining = await getPendingRecordsForSync();
    notifySyncStatus(remaining.length, true);
    onProgress?.(record.localId, "syncing");
    try {
      const formData = buildFormDataFromPending(record);
      const response = await fetch("/api/records", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        await setPendingRecordStatus(record.localId, "failed", undefined, data.error || "请求失败");
        onProgress?.(record.localId, "failed");
        failed += 1;
        continue;
      }
      await removePendingRecord(record.localId);
      onProgress?.(record.localId, "synced");
      synced += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络异常";
      await setPendingRecordStatus(record.localId, "failed", undefined, msg);
      onProgress?.(record.localId, "failed");
      failed += 1;
    }
  }
  const remaining = await getPendingRecordsForSync();
  notifySyncStatus(remaining.length, false);
  return { synced, failed };
}

/** 供历史列表展示：所有本地待同步记录（含 syncing/failed） */
export async function getPendingRecordsForDisplay(): Promise<PendingRecord[]> {
  const all = await getAllPendingRecords();
  return all.filter((r) => r.syncStatus !== "synced");
}

/** 将本地待同步记录转为历史列表可用的结构（与 KnowledgeRecord 兼容） */
export function pendingToRecordLike(pending: PendingRecord): Record<string, unknown> {
  const p = pending.payload;
  const summary = p.contentText.slice(0, 120).replace(/\n/g, " ") || "未同步";
  const keywords = p.userTags
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    id: pending.localId,
    title: p.title || summary.slice(0, 30) || "未同步",
    sourceLabel: p.sourceLabel,
    sourceChannel: "本地",
    recordType: p.files.length > 0 ? "mixed" : "text",
    contentText: p.contentText,
    extractedText: p.contentText,
    summary,
    contextNote: p.contextNote,
    keywords,
    actionItems: [],
    suggestedTargets: [],
    createdAt: pending.createdAt,
    updatedAt: pending.createdAt,
    assets: [],
    syncRuns: [],
    _localPending: true,
    _syncStatus: pending.syncStatus,
  };
}
