-- 005-competitive-watch.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS competitor_prices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  our_sku         TEXT        NOT NULL,
  our_price       DECIMAL(10,2),
  competitor_name TEXT        NOT NULL,
  competitor_price DECIMAL(10,2),
  competitor_url  TEXT,
  price_diff      DECIMAL(10,2),
  price_diff_pct  DECIMAL(5,2),
  scraped_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_sku ON competitor_prices(our_sku);
CREATE INDEX IF NOT EXISTS idx_cp_scraped ON competitor_prices(scraped_at DESC);

ALTER TABLE competitor_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_prices_admin_all" ON competitor_prices
  FOR ALL USING (true);
