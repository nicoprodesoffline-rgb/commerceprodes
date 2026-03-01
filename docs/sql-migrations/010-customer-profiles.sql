-- Migration 010 — Customer profiles B2B
-- Run in: Supabase Dashboard > SQL Editor
-- Idempotent (safe to re-run)

CREATE TABLE IF NOT EXISTS customer_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id uuid,                              -- FK to customer_accounts.id if available
  email               text NOT NULL UNIQUE,
  nom                 text,
  organisme           text,
  siret               text,
  telephone           text,
  billing_address     jsonb NOT NULL DEFAULT '{}'::jsonb,
  shipping_address    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- FK to customer_accounts (only if table exists — optional)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_accounts') THEN
    BEGIN
      ALTER TABLE customer_profiles
        ADD CONSTRAINT fk_customer_profiles_account
        FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;

-- Index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON customer_profiles(email);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
