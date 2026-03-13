import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { paths } from "@/lib/config";

let database: Database.Database | null = null;

function ensureDirectories() {
  fs.mkdirSync(path.dirname(paths.dbFile), { recursive: true });
  fs.mkdirSync(paths.uploadsDir, { recursive: true });
}

function initialize(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_label TEXT NOT NULL,
      source_channel TEXT NOT NULL,
      record_type TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      extracted_text TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      context_note TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '[]',
      action_items TEXT NOT NULL DEFAULT '[]',
      suggested_targets TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      embedding TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
    USING fts5(chunk_id UNINDEXED, record_id UNINDEXED, content, reason);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL,
      external_ref TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      record_id TEXT,
      content TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE SET NULL
    );
  `);

  migrate(db);
}

function migrate(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("tags")) {
    db.exec(`ALTER TABLE assets ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!colNames.has("description")) {
    db.exec(`ALTER TABLE assets ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.has("ocr_text")) {
    db.exec(`ALTER TABLE assets ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''`);
  }
}

export function getDb() {
  if (database) {
    return database;
  }

  ensureDirectories();
  database = new Database(paths.dbFile);
  initialize(database);
  return database;
}
