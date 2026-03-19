-- Migration 019: Commercial pricing governance
-- Adds:
-- 1) Temporal promotion layer (lot-only or unit overrides)
-- 2) Price-impact attribute rules (product + family scope)

DO $$ BEGIN
  CREATE TYPE promotion_pricing_mode AS ENUM (
    'lot',
    'unit_flat_discount',
    'unit_percent_discount',
    'unit_sale_price'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS product_promotion_layers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pricing_profile_id      uuid REFERENCES product_pricing_profiles(id) ON DELETE SET NULL,
  label                   text NOT NULL,
  mode                    promotion_pricing_mode NOT NULL,
  discount_amount         numeric(12,2),
  discount_percent        numeric(7,4),
  override_unit_price_ht  numeric(12,2),
  force_promotions_category boolean NOT NULL DEFAULT true,
  active                  boolean NOT NULL DEFAULT true,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  position                integer NOT NULL DEFAULT 100,
  meta                    jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_product_promotion_dates CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
  ),
  CONSTRAINT chk_product_promotion_values CHECK (
    (mode = 'lot') OR
    (mode = 'unit_flat_discount' AND discount_amount IS NOT NULL AND discount_amount >= 0) OR
    (mode = 'unit_percent_discount' AND discount_percent IS NOT NULL AND discount_percent >= 0 AND discount_percent <= 100) OR
    (mode = 'unit_sale_price' AND override_unit_price_ht IS NOT NULL AND override_unit_price_ht >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_product_promotion_layers_product
  ON product_promotion_layers(product_id, active, position);

CREATE INDEX IF NOT EXISTS idx_product_promotion_layers_date
  ON product_promotion_layers(starts_at, ends_at)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS pricing_attribute_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid REFERENCES products(id) ON DELETE CASCADE,
  family_id     uuid REFERENCES product_families(id) ON DELETE CASCADE,
  attribute_id  uuid NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  impacts_price boolean NOT NULL DEFAULT false,
  source        text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto')),
  confidence    numeric(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pricing_attribute_target CHECK (
    (product_id IS NOT NULL)::int + (family_id IS NOT NULL)::int = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_attribute_rules_product
  ON pricing_attribute_rules(product_id, attribute_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_attribute_rules_family
  ON pricing_attribute_rules(family_id, attribute_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_attribute_rules_active
  ON pricing_attribute_rules(active, impacts_price);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_promotion_layers_updated_at ON product_promotion_layers;
CREATE TRIGGER trg_product_promotion_layers_updated_at
  BEFORE UPDATE ON product_promotion_layers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_attribute_rules_updated_at ON pricing_attribute_rules;
CREATE TRIGGER trg_pricing_attribute_rules_updated_at
  BEFORE UPDATE ON pricing_attribute_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
