-- Migration 009: customer_accounts
-- Comptes clients B2B PRODES (Step 9)
-- Accès exclusif via service_role (API Next.js) — bypass RLS
-- Idempotente : peut être rejouée sans erreur

CREATE TABLE IF NOT EXISTS customer_accounts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        UNIQUE NOT NULL,
  password_hash  TEXT        NOT NULL,
  prenom         TEXT,
  nom            TEXT,
  organisme      TEXT,
  telephone      TEXT,
  email_verified BOOLEAN     NOT NULL DEFAULT false,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_email
  ON customer_accounts(email);

-- Sécurité : accès public anon interdit (service_role bypass RLS)
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_accounts'
      AND policyname = 'deny_public_access'
  ) THEN
    CREATE POLICY "deny_public_access" ON customer_accounts
      USING (false);
  END IF;
END$$;

-- Trigger : mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION fn_update_customer_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_customer_accounts_updated_at ON customer_accounts;
CREATE TRIGGER tg_customer_accounts_updated_at
  BEFORE UPDATE ON customer_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_update_customer_updated_at();
