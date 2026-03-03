-- Migration 018: Lot Pricing Engine
-- Adds a non-explosive commercial layer to sell variants/families by lots
-- without creating combinatorial variant rows.

-- ─── product_pricing_profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_pricing_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  parent_family_id uuid REFERENCES product_families(id) ON DELETE SET NULL,
  profile_key      text NOT NULL,
  label            text NOT NULL,
  applies_to       text NOT NULL DEFAULT 'variant'
    CHECK (applies_to IN ('variant', 'family', 'product')),
  axis             jsonb NOT NULL DEFAULT '{}',
  source           text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_parent_sku', 'auto_sku_root', 'auto_title_root')),
  active           boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_pricing_profile_key
  ON product_pricing_profiles(product_id, profile_key);

CREATE INDEX IF NOT EXISTS idx_product_pricing_profiles_product
  ON product_pricing_profiles(product_id);

CREATE INDEX IF NOT EXISTS idx_product_pricing_profiles_family
  ON product_pricing_profiles(parent_family_id)
  WHERE parent_family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_pricing_profiles_active
  ON product_pricing_profiles(active, position);

-- ─── product_lot_offers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_lot_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_profile_id uuid NOT NULL REFERENCES product_pricing_profiles(id) ON DELETE CASCADE,
  code               text,
  label              text NOT NULL,
  paid_units         integer NOT NULL CHECK (paid_units >= 1),
  bonus_units        integer NOT NULL DEFAULT 0 CHECK (bonus_units >= 0),
  lot_price_ht       numeric(12,2) NOT NULL CHECK (lot_price_ht >= 0),
  eco_included       boolean NOT NULL DEFAULT true,
  active             boolean NOT NULL DEFAULT true,
  starts_at          timestamptz,
  ends_at            timestamptz,
  position           integer NOT NULL DEFAULT 100,
  meta               jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_offer_dates CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
  )
);

CREATE INDEX IF NOT EXISTS idx_product_lot_offers_profile
  ON product_lot_offers(pricing_profile_id, active, position);

CREATE INDEX IF NOT EXISTS idx_product_lot_offers_dates
  ON product_lot_offers(starts_at, ends_at)
  WHERE active = true;

-- ─── variant_pricing_profiles (variant -> profile binding) ──────────────────
CREATE TABLE IF NOT EXISTS variant_pricing_profiles (
  variant_id          uuid PRIMARY KEY REFERENCES variants(id) ON DELETE CASCADE,
  pricing_profile_id  uuid NOT NULL REFERENCES product_pricing_profiles(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variant_pricing_profiles_profile
  ON variant_pricing_profiles(pricing_profile_id);

-- ─── Helpers: updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_pricing_profiles_updated_at ON product_pricing_profiles;
CREATE TRIGGER trg_product_pricing_profiles_updated_at
  BEFORE UPDATE ON product_pricing_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_lot_offers_updated_at ON product_lot_offers;
CREATE TRIGGER trg_product_lot_offers_updated_at
  BEFORE UPDATE ON product_lot_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_variant_pricing_profiles_updated_at ON variant_pricing_profiles;
CREATE TRIGGER trg_variant_pricing_profiles_updated_at
  BEFORE UPDATE ON variant_pricing_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
