-- Migration 021: PUID identity layer
-- Adds non-destructive identity columns to products/variants.
-- SKU replacement remains optional at API level.

ALTER TABLE products ADD COLUMN IF NOT EXISTS puid text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS puid_root text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS puid_price_branch text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS puid_style_branch text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS puid_generated_at timestamptz;

ALTER TABLE variants ADD COLUMN IF NOT EXISTS puid text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS puid_root text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS puid_price_branch text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS puid_style_branch text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS puid_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_puid ON products(puid) WHERE puid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_puid_root ON products(puid_root) WHERE puid_root IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_puid ON variants(puid) WHERE puid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_puid_root ON variants(puid_root) WHERE puid_root IS NOT NULL;
