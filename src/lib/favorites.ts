import { mapRecord, type AssetRow, type RecordRow, type SyncRow } from "@/lib/records";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { KnowledgeRecord } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

export async function addFavorite(userId: string, recordId: string) {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("record_id", recordId)
    .maybeSingle();

  if (existing) return existing.id;

  const id = createId("fav");
  await supabase.from("favorites").insert({
    id,
    user_id: userId,
    record_id: recordId,
    created_at: nowIso(),
  });
  return id;
}

export async function removeFavorite(userId: string, recordId: string) {
  await getSupabaseAdmin()
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("record_id", recordId);
}

export async function isFavorite(userId: string, recordId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("record_id", recordId)
    .maybeSingle();
  return !!data;
}

export async function listFavorites(userId: string): Promise<KnowledgeRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("favorites")
    .select("record_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const favorites = rows || [];
  const ids = favorites.map((row) => row.record_id).filter(Boolean);
  if (ids.length === 0) return [];

  const [{ data: recordRows }, { data: assetRows }, { data: syncRows }] = await Promise.all([
    supabase
      .from("records")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("id", ids),
    supabase
      .from("assets")
      .select("*")
      .eq("user_id", userId)
      .in("record_id", ids)
      .order("created_at", { ascending: true }),
    supabase
      .from("sync_runs")
      .select("*")
      .eq("user_id", userId)
      .in("record_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const assetsByRecord = new Map<string, AssetRow[]>();
  for (const asset of (assetRows || []) as AssetRow[]) {
    const arr = assetsByRecord.get(asset.record_id) || [];
    arr.push(asset);
    assetsByRecord.set(asset.record_id, arr);
  }

  const syncByRecord = new Map<string, SyncRow[]>();
  for (const sync of (syncRows || []) as SyncRow[]) {
    const arr = syncByRecord.get(sync.record_id) || [];
    arr.push(sync);
    syncByRecord.set(sync.record_id, arr);
  }

  const recordsById = new Map<string, KnowledgeRecord>();
  for (const record of (recordRows || []) as RecordRow[]) {
    recordsById.set(
      record.id,
      mapRecord(record, assetsByRecord.get(record.id) || [], syncByRecord.get(record.id) || []),
    );
  }

  return ids.map((id) => recordsById.get(id)).filter((record): record is KnowledgeRecord => Boolean(record));
}

export async function getFavoriteRecordIds(userId: string): Promise<Set<string>> {
  const { data: rows } = await getSupabaseAdmin()
    .from("favorites")
    .select("record_id")
    .eq("user_id", userId);
  return new Set((rows || []).map((r) => r.record_id));
}
