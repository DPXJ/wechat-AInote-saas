-- 为 project_tasks 增加完成时间，便于「已完成」时间线回顾（在 Supabase SQL Editor 执行一次即可）
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE project_tasks
SET completed_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;
