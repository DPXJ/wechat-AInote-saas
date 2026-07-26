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

export function assetUrl(id: string, download = false) {
  return `${apiBaseUrl}/api/assets/${id}${download ? "?download=1" : ""}`;
}
