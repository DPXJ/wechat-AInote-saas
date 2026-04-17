-- 闪念：仅为「已有项目」增加 flash_memos 表与策略（可安全重复执行）
-- 在 Supabase：Dashboard → SQL Editor → New query → 粘贴本文件 → Run

-- 1) 表与索引
CREATE TABLE IF NOT EXISTS flash_memos (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  external_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flash_memos_user_created ON flash_memos(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flash_memos_user_external
  ON flash_memos(user_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- 2) RLS
ALTER TABLE flash_memos ENABLE ROW LEVEL SECURITY;

-- 若曾执行过本脚本，先删再建，避免 “policy already exists”
DROP POLICY IF EXISTS "Users manage own flash_memos" ON flash_memos;
DROP POLICY IF EXISTS "Service role full access flash_memos" ON flash_memos;

CREATE POLICY "Users manage own flash_memos" ON flash_memos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access flash_memos" ON flash_memos FOR ALL TO service_role
  USING (true) WITH CHECK (true);
