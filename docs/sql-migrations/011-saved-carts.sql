-- Migration 011 — Saved carts B2B
-- Run in: Supabase Dashboard > SQL Editor
-- Idempotent (safe to re-run)

CREATE TABLE IF NOT EXISTS saved_carts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_saved_carts_email_name UNIQUE (email, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_carts_email ON saved_carts(email);

DROP TRIGGER IF EXISTS trg_saved_carts_updated_at ON saved_carts;
CREATE TRIGGER trg_saved_carts_updated_at
  BEFORE UPDATE ON saved_carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
