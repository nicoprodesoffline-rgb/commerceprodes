-- Migration 014 — Product bundles / packs
-- Créer via Supabase Dashboard > SQL Editor
-- Ne pas exécuter automatiquement

CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  primary_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- items: JSON array de { product_id, quantity, title }
  items JSONB NOT NULL DEFAULT '[]',
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundles_primary_product ON bundles(primary_product_id);
CREATE INDEX IF NOT EXISTS idx_bundles_active ON bundles(active) WHERE active = true;

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_bundles'
  ) THEN
    CREATE TRIGGER set_updated_at_bundles
      BEFORE UPDATE ON bundles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- RLS: lecture publique, écriture service_role uniquement
ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bundles_select_active" ON bundles
  FOR SELECT USING (active = true);

-- Exemple de seed (décommenter pour tester)
-- INSERT INTO bundles (title, primary_product_id, items, discount_type, discount_value) VALUES
-- ('Pack salle de réunion', '<uuid-produit>', '[{"product_id":"<uuid2>","quantity":4,"title":"Chaises empilables"}]', 'percent', 10);
