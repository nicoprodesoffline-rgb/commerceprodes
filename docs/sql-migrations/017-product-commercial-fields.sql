-- Migration 017: Product Commercial Fields Extension
-- Adds variation-level commercial, logistics, and supplier fields
-- All idempotent (IF NOT EXISTS / DO $$ blocks)

-- ─── Variants: commercial & logistics fields ──────────────────────────────────
ALTER TABLE variants ADD COLUMN IF NOT EXISTS gtin_upc_ean_isbn     text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS tax_class_override     text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS active_flag            boolean NOT NULL DEFAULT true;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS downloadable           boolean NOT NULL DEFAULT false;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS virtual                boolean NOT NULL DEFAULT false;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS ignore_attribute_stock boolean NOT NULL DEFAULT false;

-- ─── Variants: quantity rules ─────────────────────────────────────────────────
ALTER TABLE variants ADD COLUMN IF NOT EXISTS quantity_rules_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS min_quantity           integer NOT NULL DEFAULT 1 CHECK (min_quantity >= 1);
ALTER TABLE variants ADD COLUMN IF NOT EXISTS max_quantity           integer CHECK (max_quantity IS NULL OR max_quantity >= 1);
ALTER TABLE variants ADD COLUMN IF NOT EXISTS group_of_quantity      integer NOT NULL DEFAULT 1 CHECK (group_of_quantity >= 1);
ALTER TABLE variants ADD COLUMN IF NOT EXISTS stock_multiplier       numeric(8,3) NOT NULL DEFAULT 1 CHECK (stock_multiplier > 0);
ALTER TABLE variants ADD COLUMN IF NOT EXISTS initial_stock          integer;

-- ─── Variants: supplier ───────────────────────────────────────────────────────
ALTER TABLE variants ADD COLUMN IF NOT EXISTS supplier_ref           text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS supplier_name          text;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS supplier_purchase_price numeric(10,2) CHECK (supplier_purchase_price IS NULL OR supplier_purchase_price >= 0);

-- ─── Variants: eco at variant level (override) ────────────────────────────────
ALTER TABLE variants ADD COLUMN IF NOT EXISTS eco_contribution       numeric(8,2) CHECK (eco_contribution IS NULL OR eco_contribution >= 0);

-- ─── Products: attribute defaults & Woo parent SKU ───────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_attribute_values jsonb NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_sku              text;

-- index for parent_sku lookups (family suggestion strategy)
CREATE INDEX IF NOT EXISTS idx_products_parent_sku ON products(parent_sku) WHERE parent_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_active_flag ON variants(active_flag);
CREATE INDEX IF NOT EXISTS idx_variants_supplier_ref ON variants(supplier_ref) WHERE supplier_ref IS NOT NULL;
