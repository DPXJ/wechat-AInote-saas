import { supabase } from "./supabase";

export type FileTimelineItem = {
  id: string;
  recordId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  tags: string[];
  description: string;
  ocrText: string;
  createdAt: string;
  recordTitle: string;
  recordSummary: string;
  recordSourceLabel: string;
  recordCreatedAt: string;
};

export type KnowledgeRecord = {
  id: string;
  title: string;
  summary: string;
  sourceLabel: string;
  recordType: string;
  contentText: string;
  createdAt: string;
  tags: string[];
  assets: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
  }>;
};

export type TodoItem = {
  id: string;
  content: string;
  priority: "low" | "medium" | "high";
  status: "open" | "done" | "archived";
  createdAt: string;
};

const apiBaseUrl = (process.env.EXPO_PUBLIC_APP_API_BASE_URL || "https://aixinji.linknewai.com").replace(/\/+$/, "");

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `请求失败：${res.status}`);
  }
  return data as T;
}

export async function listTimeline() {
  return apiFetch<{ files: FileTimelineItem[] }>("/api/files/timeline?limit=80");
}

export async function listRecords() {
  return apiFetch<{ records: KnowledgeRecord[]; total: number }>("/api/records?limit=50");
}

export async function listTodos() {
  return apiFetch<{ todos: TodoItem[]; total: number }>("/api/todos?limit=80&status=open");
}

export async function createTodo(content: string, priority: TodoItem["priority"]) {
  return apiFetch<{ todo: TodoItem }>("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, priority }),
  });
}

export async function createRecord(formData: FormData) {
  return apiFetch<{ record: KnowledgeRecord; syncWarnings: string[] }>("/api/records", {
    method: "POST",
    body: formData,
  });
}

export function assetUrl(id: string, download = false) {
  return `${apiBaseUrl}/api/assets/${id}${download ? "?download=1" : ""}`;
}
