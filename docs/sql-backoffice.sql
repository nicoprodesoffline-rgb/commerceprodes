-- ============================================================
-- PRODES B2B — Backoffice SQL
-- INSTRUCTIONS : Copier-coller dans
-- https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql
-- Exécuter dans cet ordre. Vérifier "Success" pour chaque bloc.
-- ============================================================


-- ============================================================
-- 1. TABLE DES DEMANDES DE DEVIS
-- ============================================================

CREATE TABLE IF NOT EXISTS devis_requests (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  nom         text         NOT NULL,
  email       text         NOT NULL,
  telephone   text,
  produit     text         NOT NULL,
  sku         text,
  quantite    integer,
  message     text,
  status      text         DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'en_cours', 'traite', 'archive', 'refuse')),
  notes_internes text,
  assigned_to    text,
  ip_address     text
);

-- INDEX pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_devis_requests_status
  ON devis_requests(status);
CREATE INDEX IF NOT EXISTS idx_devis_requests_created_at
  ON devis_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devis_requests_email
  ON devis_requests(email);


-- ============================================================
-- 2. TABLE DES SESSIONS ADMIN (auth par token)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  token      text         NOT NULL UNIQUE,
  created_at timestamptz  DEFAULT now(),
  expires_at timestamptz  NOT NULL,
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token
  ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions(expires_at);


-- ============================================================
-- 3. TRIGGER updated_at automatique sur devis_requests
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_devis_requests_updated_at ON devis_requests;
CREATE TRIGGER update_devis_requests_updated_at
  BEFORE UPDATE ON devis_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 4. ROW LEVEL SECURITY (optionnel — désactivé par défaut)
-- Si vous souhaitez restreindre l'accès via anon key :
-- ALTER TABLE devis_requests ENABLE ROW LEVEL SECURITY;
-- (nécessite de créer des policies Supabase Auth séparément)
-- ============================================================

-- Vérification finale
SELECT 'devis_requests OK' AS status FROM devis_requests LIMIT 0;
SELECT 'admin_sessions OK' AS status FROM admin_sessions LIMIT 0;
