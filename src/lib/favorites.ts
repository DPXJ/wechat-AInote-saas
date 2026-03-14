import { getKnowledgeRecord } from "@/lib/records";
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
  const { data: rows } = await getSupabaseAdmin()
    .from("favorites")
    .select("record_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const records: KnowledgeRecord[] = [];
  for (const row of rows || []) {
    const rec = await getKnowledgeRecord(userId, row.record_id);
    if (rec) records.push(rec);
  }
  return records;
}

export async function getFavoriteRecordIds(userId: string): Promise<Set<string>> {
  const { data: rows } = await getSupabaseAdmin()
    .from("favorites")
    .select("record_id")
    .eq("user_id", userId);
  return new Set((rows || []).map((r) => r.record_id));
}
