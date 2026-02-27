-- 008-site-config.sql
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

CREATE TABLE IF NOT EXISTS site_config (
  key        TEXT        PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO site_config (key, value) VALUES
  ('promo_banner_text', 'Livraison incluse sur tous nos produits · Devis gratuit sous 24h'),
  ('promo_banner_link', ''),
  ('promo_banner_active', 'true'),
  ('contact_phone', '04 67 24 30 34'),
  ('contact_email', 'contact@prodes.fr'),
  ('contact_address', 'PRODES — 34000 Montpellier'),
  ('contact_hours', 'Lun–Sam 8h30–19h')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_config_admin_all" ON site_config FOR ALL USING (true);

-- Table testimonials
CREATE TABLE IF NOT EXISTS testimonials (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author     TEXT        NOT NULL,
  role       TEXT,
  content    TEXT        NOT NULL,
  rating     INTEGER     DEFAULT 5,
  active     BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO testimonials (author, role, content) VALUES
  ('Jean-Michel B.', 'DGS — Mairie de Caen',
   'PRODES nous accompagne depuis 3 ans. Délais respectés, produits conformes aux normes. Facturation Chorus Pro sans friction.'),
  ('Sophie L.', 'Responsable Achats — Grand Lyon',
   'Devis reçu en moins de 2h, produits livrés dans les temps. Je recommande pour tous vos appels d''offres équipements.'),
  ('Thomas R.', 'Directeur Technique — École nationale supérieure',
   'Catalogue très complet pour les collectivités. Le mandat administratif est bien géré. Service client réactif.')
ON CONFLICT DO NOTHING;

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "testimonials_admin_all" ON testimonials FOR ALL USING (true);
