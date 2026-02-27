-- 004-homepage-sections.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS homepage_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  intro       TEXT,
  product_ids JSONB       NOT NULL DEFAULT '[]',
  position    INTEGER     DEFAULT 0,
  active      BOOLEAN     DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hs_active ON homepage_sections(active);
CREATE INDEX IF NOT EXISTS idx_hs_position ON homepage_sections(position);

ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homepage_sections_admin_all" ON homepage_sections
  FOR ALL USING (true);
