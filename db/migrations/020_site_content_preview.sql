-- Cercle 3 (3.26, B14) : l'aperçu fidèle d'une page en brouillon. Le SITE tire lui-même le jeton (personne ne peut le deviner, la Factory comprise), garde les octets du document
-- d'aperçu signé au plus 30 minutes, et ne l'active jamais : il ne remplace aucun contenu servi.
CREATE TABLE site_content_preview (
  preview_id    char(32)    PRIMARY KEY CHECK (preview_id ~ '^[0-9a-f]{32}$'),
  content_bytes bytea       NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_content_preview_expiry ON site_content_preview (expires_at);
COMMENT ON TABLE site_content_preview IS 'Cercle 3 - aperçus de pages ; durée de vie 30 minutes au plus ; jamais un état actif';
