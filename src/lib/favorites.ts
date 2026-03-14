import { getDb } from "@/lib/db";
import { getKnowledgeRecord } from "@/lib/records";
import type { KnowledgeRecord } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

export function addFavorite(recordId: string) {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM favorites WHERE record_id = ?")
    .get(recordId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = createId("fav");
  db.prepare(
    "INSERT INTO favorites (id, record_id, created_at) VALUES (?, ?, ?)",
  ).run(id, recordId, nowIso());
  return id;
}

export function removeFavorite(recordId: string) {
  getDb().prepare("DELETE FROM favorites WHERE record_id = ?").run(recordId);
}

export function isFavorite(recordId: string): boolean {
  return !!getDb()
    .prepare("SELECT id FROM favorites WHERE record_id = ?")
    .get(recordId);
}

export function listFavorites(): KnowledgeRecord[] {
  const rows = getDb()
    .prepare(
      "SELECT record_id FROM favorites ORDER BY created_at DESC",
    )
    .all() as Array<{ record_id: string }>;

  const records: KnowledgeRecord[] = [];
  for (const row of rows) {
    const rec = getKnowledgeRecord(row.record_id);
    if (rec) records.push(rec);
  }
  return records;
}

export function getFavoriteRecordIds(): Set<string> {
  const rows = getDb()
    .prepare("SELECT record_id FROM favorites")
    .all() as Array<{ record_id: string }>;
  return new Set(rows.map((r) => r.record_id));
}
