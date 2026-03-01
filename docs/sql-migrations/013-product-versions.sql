-- Migration 013 — Product versions (rollback support)
-- Run in: Supabase Dashboard > SQL Editor
-- Idempotent (safe to re-run)

CREATE TABLE IF NOT EXISTS product_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL,
  version_num  integer NOT NULL DEFAULT 1,
  snapshot     jsonb NOT NULL,           -- full product snapshot before the change
  changed_by   text NOT NULL DEFAULT 'admin',
  change_note  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions(product_id, version_num DESC);
