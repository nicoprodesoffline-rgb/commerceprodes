-- Migration 022: Canonical JSONB Hybrid Model
-- Implements the validated canonical product model decisions (2026-03-18):
--   - JSONB attributes on variants (replaces EAV pattern)
--   - Declared axes on products (TEXT[])
--   - Consultative attribute registry (replaces attributes table role)
--   - Completes pricing_profiles with base_price_ht
--   - Completes lot_offers with degressive mode support
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Ref: docs/CANONICAL_PRODUCT_MODEL.md

-- ─── 1. Products: declared axes ────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS axes_prix  TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS axes_style TEXT[] DEFAULT '{}';

COMMENT ON COLUMN products.axes_prix  IS 'Attribute keys that impact price (e.g. diametre, assemblage)';
COMMENT ON COLUMN products.axes_style IS 'Attribute keys that do NOT impact price (e.g. coloris, pietement)';

-- ─── 2. Variants: JSONB attributes ────────────────────────────────────────────

ALTER TABLE variants ADD COLUMN IF NOT EXISTS attributs_prix JSONB DEFAULT '{}';

COMMENT ON COLUMN variants.attributs_prix IS 'All variant attributes as JSONB (axes_prix + axes_style merged). Source of truth for filtering and pricing resolution.';

CREATE INDEX IF NOT EXISTS idx_variants_attributs_prix
  ON variants USING gin(attributs_prix jsonb_path_ops);

-- ─── 3. Attribute registry (consultative, not constraining) ───────────────────

CREATE TABLE IF NOT EXISTS attribute_registry (
  slug         TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  data_type    TEXT NOT NULL DEFAULT 'text'
    CHECK (data_type IN ('text', 'numeric', 'enum', 'boolean')),
  unit         TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE attribute_registry IS 'Consultative reference for known attribute keys. Used for autocomplete and filter labels, NOT as a constraint on JSONB values.';

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attribute_registry_updated_at ON attribute_registry;
CREATE TRIGGER trg_attribute_registry_updated_at
  BEFORE UPDATE ON attribute_registry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 4. Complete product_pricing_profiles: add base_price_ht ──────────────────

ALTER TABLE product_pricing_profiles
  ADD COLUMN IF NOT EXISTS base_price_ht NUMERIC(10,2);

COMMENT ON COLUMN product_pricing_profiles.base_price_ht IS 'Base unit price HT for this price branch. All variants sharing this branch inherit this price.';

-- ─── 5. Complete product_lot_offers: degressive mode support ──────────────────

ALTER TABLE product_lot_offers
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'flat';

-- Add check constraint only if it doesn't exist
DO $$ BEGIN
  ALTER TABLE product_lot_offers
    ADD CONSTRAINT chk_lot_offer_mode CHECK (mode IN ('flat', 'degressive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE product_lot_offers
  ADD COLUMN IF NOT EXISTS min_quantity INTEGER;

ALTER TABLE product_lot_offers
  ADD COLUMN IF NOT EXISTS unit_price_ht NUMERIC(10,2);

COMMENT ON COLUMN product_lot_offers.mode IS 'flat = X bought + Y free (uses paid_units/bonus_units/lot_price_ht). degressive = from N units, unit price = X (uses min_quantity/unit_price_ht).';
COMMENT ON COLUMN product_lot_offers.min_quantity IS 'Degressive mode: minimum quantity to trigger this tier price.';
COMMENT ON COLUMN product_lot_offers.unit_price_ht IS 'Degressive mode: unit price HT at this quantity tier.';

-- ─── 6. Variants: supplier_code for multi-supplier traceability ───────────────

ALTER TABLE variants ADD COLUMN IF NOT EXISTS supplier_code TEXT;

COMMENT ON COLUMN variants.supplier_code IS 'Supplier code propagated from the ingestion source. Matches products.supplier_code.';
