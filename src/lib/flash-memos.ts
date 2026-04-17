import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FlashMemo, FlashMemoSource } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

function mapRow(row: Record<string, unknown>): FlashMemo {
  return {
    id: row.id as string,
    content: row.content as string,
    source: row.source as FlashMemoSource,
    externalId: (row.external_id as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string) || null,
  };
}

const SOURCE_SET = new Set<FlashMemoSource>(["flomo", "api", "web"]);

function normalizeSource(v: unknown): FlashMemoSource {
  if (v === "flomo" || v === "api" || v === "web") return v;
  return "web";
}

export async function resolveUserIdByIngestToken(token: string): Promise<string | null> {
  const t = token.trim();
  if (!t) return null;
  const { data } = await getSupabaseAdmin()
    .from("settings")
    .select("user_id")
    .eq("key", "flashMemoIngestToken")
    .eq("value", t)
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

export async function getFlashMemo(userId: string, id: string) {
  const { data } = await getSupabaseAdmin()
    .from("flash_memos")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getFlashMemoByExternalId(userId: string, externalId: string) {
  const { data } = await getSupabaseAdmin()
    .from("flash_memos")
    .select("*")
    .eq("user_id", userId)
    .eq("external_id", externalId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listFlashMemos(
  userId: string,
  opts?: {
    q?: string;
    source?: FlashMemoSource;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  },
) {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(opts?.limit ?? 100, 500);
  const offset = Math.max(opts?.offset ?? 0, 0);

  let countQuery = supabase
    .from("flash_memos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);

  let dataQuery = supabase
    .from("flash_memos")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const q = (opts?.q || "").trim().slice(0, 200).replace(/[%_]/g, "");
  if (q) {
    countQuery = countQuery.ilike("content", `%${q}%`);
    dataQuery = dataQuery.ilike("content", `%${q}%`);
  }

  if (opts?.source && SOURCE_SET.has(opts.source)) {
    countQuery = countQuery.eq("source", opts.source);
    dataQuery = dataQuery.eq("source", opts.source);
  }

  if (opts?.dateFrom) {
    countQuery = countQuery.gte("created_at", opts.dateFrom);
    dataQuery = dataQuery.gte("created_at", opts.dateFrom);
  }
  if (opts?.dateTo) {
    countQuery = countQuery.lte("created_at", opts.dateTo);
    dataQuery = dataQuery.lte("created_at", opts.dateTo);
  }

  const { count: total } = await countQuery;

  const { data: rows } = await dataQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { memos: (rows || []).map(mapRow), total: total ?? 0 };
}

export async function createFlashMemo(
  userId: string,
  input: { content: string; source?: FlashMemoSource; externalId?: string | null },
) {
  const content = input.content.trim();
  if (!content) {
    throw new Error("内容不能为空。");
  }

  const source = input.source !== undefined ? normalizeSource(input.source) : "web";
  const externalId = (input.externalId || "").trim() || null;

  if (externalId) {
    const existing = await getFlashMemoByExternalId(userId, externalId);
    if (existing) return existing;
  }

  const now = nowIso();
  const id = createId("flash");

  await getSupabaseAdmin().from("flash_memos").insert({
    id,
    user_id: userId,
    content,
    source,
    external_id: externalId,
    created_at: now,
    updated_at: now,
  });

  return getFlashMemo(userId, id);
}

export async function softDeleteFlashMemo(userId: string, id: string) {
  const now = nowIso();
  await getSupabaseAdmin()
    .from("flash_memos")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
}
