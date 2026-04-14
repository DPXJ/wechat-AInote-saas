-- 为 project_tasks 增加 tags 标签数组（在 Supabase SQL Editor 执行一次即可）
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
