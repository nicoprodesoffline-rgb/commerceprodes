-- 006-import-logs.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS import_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       TEXT,
  file_url       TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending',
  rows_processed INTEGER     DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN import_logs.status IS 'pending | processing | done | error';

CREATE INDEX IF NOT EXISTS idx_il_created ON import_logs(created_at DESC);

ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_logs_admin_all" ON import_logs
  FOR ALL USING (true);
