-- 007-analytics.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS product_views (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID        REFERENCES products(id) ON DELETE SET NULL,
  product_handle TEXT        NOT NULL,
  session_id     TEXT,
  viewed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_handle  ON product_views(product_handle);
CREATE INDEX IF NOT EXISTS idx_pv_viewed  ON product_views(viewed_at DESC);

CREATE TABLE IF NOT EXISTS cart_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT        NOT NULL,
  product_id     UUID,
  product_handle TEXT,
  sku            TEXT,
  quantity       INTEGER     DEFAULT 1,
  session_id     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN cart_events.event_type IS 'add | remove | checkout_start | checkout_complete';

CREATE INDEX IF NOT EXISTS idx_ce_type    ON cart_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ce_created ON cart_events(created_at DESC);

ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_views_admin_all" ON product_views  FOR ALL USING (true);
CREATE POLICY "cart_events_admin_all"   ON cart_events    FOR ALL USING (true);
