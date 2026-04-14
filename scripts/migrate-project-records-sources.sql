-- 项目关联「已确认信源」：在 Supabase SQL Editor 执行一次（可重复执行）
-- 1) records.confirmed_at：非空表示该记录已确认为可关联信源
-- 2) project_records：项目与信源的多对多（同一记录在同一项目内唯一）

ALTER TABLE records ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_records_user_confirmed
  ON records(user_id)
  WHERE confirmed_at IS NOT NULL AND deleted_at IS NULL;

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

ALTER TABLE project_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own project_records" ON project_records;
CREATE POLICY "Users manage own project_records" ON project_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access project_records" ON project_records;
CREATE POLICY "Service role full access project_records" ON project_records FOR ALL TO service_role USING (true) WITH CHECK (true);
