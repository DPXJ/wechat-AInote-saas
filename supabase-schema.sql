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
  confirmed_at TIMESTAMPTZ,
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

-- Projects (工作项目：容器 + 多条任务，可投递滴答清单)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_archived ON projects(user_id, archived);

CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_user_id ON project_tasks(user_id);

-- 项目 ↔ 已确认信源（records.confirmed_at 非空才可关联）
CREATE TABLE IF NOT EXISTS project_records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_project_records_project_id ON project_records(project_id);
CREATE INDEX IF NOT EXISTS idx_project_records_record_id ON project_records(record_id);
CREATE INDEX IF NOT EXISTS idx_project_records_user_id ON project_records(user_id);

-- 任务 ↔ 已确认信源（同一任务内同一记录唯一）
CREATE TABLE IF NOT EXISTS project_task_records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_task_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_project_task_records_task ON project_task_records(project_task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_records_record ON project_task_records(record_id);
CREATE INDEX IF NOT EXISTS idx_project_task_records_user ON project_task_records(user_id);

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
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_task_records ENABLE ROW LEVEL SECURITY;

-- Policy: users can only access their own data
CREATE POLICY "Users manage own records" ON records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own assets" ON assets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own chunks" ON chunks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sync_runs" ON sync_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own settings" ON settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own todos" ON todos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own favorites" ON favorites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own projects" ON projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own project_tasks" ON project_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own project_records" ON project_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own project_task_records" ON project_task_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service role bypass: allow service_role key to access all data (for server-side operations)
CREATE POLICY "Service role full access records" ON records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access assets" ON assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access chunks" ON chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_runs" ON sync_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access settings" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access todos" ON todos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access favorites" ON favorites FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access projects" ON projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access project_tasks" ON project_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access project_records" ON project_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access project_task_records" ON project_task_records FOR ALL TO service_role USING (true) WITH CHECK (true);
