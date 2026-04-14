-- 任务级关联「已确认信源」：在 Supabase SQL Editor 执行一次（可重复执行）
-- 与 project_records（项目级，已废弃）独立；以 project_tasks 为粒度关联 records

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

ALTER TABLE project_task_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own project_task_records" ON project_task_records;
CREATE POLICY "Users manage own project_task_records" ON project_task_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access project_task_records" ON project_task_records;
CREATE POLICY "Service role full access project_task_records" ON project_task_records FOR ALL TO service_role USING (true) WITH CHECK (true);
