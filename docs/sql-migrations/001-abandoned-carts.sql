-- Migration 001 : Table abandoned_carts
-- À exécuter dans Supabase SQL Editor :
-- https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  email TEXT,
  items_json JSONB NOT NULL DEFAULT '[]',
  total_ht DECIMAL(10,2),
  total_items INTEGER DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_session
  ON abandoned_carts(session_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_created
  ON abandoned_carts(created_at DESC);

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'abandoned_carts'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only"
      ON abandoned_carts
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
