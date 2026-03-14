-- ============================================================
-- AI 信迹 - Supabase Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Records (knowledge records)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT '手动收件箱',
  source_channel TEXT NOT NULL DEFAULT 'manual-web',
  record_type TEXT NOT NULL DEFAULT 'text',
  content_text TEXT NOT NULL DEFAULT '',
  extracted_text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  context_note TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]',
  action_items JSONB NOT NULL DEFAULT '[]',
  suggested_targets JSONB NOT NULL DEFAULT '[]',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_type ON records(record_type);

-- Assets (file attachments)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  file_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_record_id ON assets(record_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);

-- Chunks (text chunks for search / embeddings)
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  embedding TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_record_id ON chunks(record_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);

-- Full-text search index on chunks
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content || ' ' || reason)) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN(tsv);

-- Sync runs (Notion / TickTick sync history)
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  external_ref TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_record_id ON sync_runs(record_id);

-- User settings (per-user key-value store)
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- Todos
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id TEXT REFERENCES records(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- ============================================================
-- Row Level Security (RLS) — enable on all tables
-- ============================================================

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Policy: users can only access their own data
CREATE POLICY "Users manage own records" ON records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own assets" ON assets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own chunks" ON chunks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sync_runs" ON sync_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own settings" ON settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own todos" ON todos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own favorites" ON favorites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service role bypass: allow service_role key to access all data (for server-side operations)
CREATE POLICY "Service role full access records" ON records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access assets" ON assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access chunks" ON chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_runs" ON sync_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access settings" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access todos" ON todos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access favorites" ON favorites FOR ALL TO service_role USING (true) WITH CHECK (true);
