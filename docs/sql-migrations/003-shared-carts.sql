-- 003-shared-carts.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS shared_carts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  items_json JSONB       NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- RLS: public read (for share links), no direct write from anon
ALTER TABLE shared_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_carts_select" ON shared_carts
  FOR SELECT USING (expires_at > NOW());

CREATE POLICY "shared_carts_insert" ON shared_carts
  FOR INSERT WITH CHECK (true);
