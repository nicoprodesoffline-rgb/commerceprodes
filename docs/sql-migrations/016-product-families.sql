-- Migration 016: Product Families
-- Creates the families model: mères (parent products) aggregate filles (child products/variants)
-- Each child can belong to at most one active family.

-- ─── Types ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE family_strategy AS ENUM ('parent_sku', 'sku_root', 'title_root', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE family_member_type AS ENUM ('product', 'variant', 'autonomous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── product_families ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_families (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL,
  strategy          family_strategy NOT NULL DEFAULT 'manual',
  active            boolean NOT NULL DEFAULT true,
  published_at      timestamptz,
  meta              jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_family_slug ON product_families(slug);
CREATE INDEX IF NOT EXISTS idx_family_parent ON product_families(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_family_active ON product_families(active);

-- ─── product_family_members ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_family_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  member_product_id   uuid REFERENCES products(id) ON DELETE CASCADE,
  member_variant_id   uuid REFERENCES variants(id) ON DELETE CASCADE,
  member_type         family_member_type NOT NULL DEFAULT 'product',
  position            integer NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  axes_summary        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_member_has_target CHECK (
    member_product_id IS NOT NULL OR member_variant_id IS NOT NULL
  ),
  CONSTRAINT chk_member_not_both CHECK (
    NOT (member_product_id IS NOT NULL AND member_variant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_family_member_family ON product_family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_member_product ON product_family_members(member_product_id) WHERE member_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_family_member_variant ON product_family_members(member_variant_id) WHERE member_variant_id IS NOT NULL;

-- Uniqueness: a product can only be an active member of ONE active family
CREATE UNIQUE INDEX IF NOT EXISTS uq_family_member_product_active
  ON product_family_members(member_product_id)
  WHERE member_product_id IS NOT NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_family_member_variant_active
  ON product_family_members(member_variant_id)
  WHERE member_variant_id IS NOT NULL AND active = true;

-- ─── product_family_candidates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_family_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_parent_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  suggested_child_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  suggested_variant_id uuid REFERENCES variants(id) ON DELETE CASCADE,
  strategy            family_strategy NOT NULL DEFAULT 'parent_sku',
  score               numeric(5,2) NOT NULL DEFAULT 0,
  reasons             jsonb NOT NULL DEFAULT '[]',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_parent ON product_family_candidates(suggested_parent_id);
CREATE INDEX IF NOT EXISTS idx_candidate_status ON product_family_candidates(status);

-- ─── Add family_role to products ─────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS family_role text
  CHECK (family_role IN ('parent','child','standalone')) DEFAULT 'standalone';

ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_family_id uuid
  REFERENCES product_families(id) ON DELETE SET NULL;

-- ─── updated_at triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_families_updated_at ON product_families;
CREATE TRIGGER trg_product_families_updated_at
  BEFORE UPDATE ON product_families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_family_members_updated_at ON product_family_members;
CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON product_family_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_candidates_updated_at ON product_family_candidates;
CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON product_family_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
