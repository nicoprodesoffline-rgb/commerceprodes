-- CA-8d : fiches publiques, sans donnée personnelle. Propriétaire : rôle qui applique les migrations SITE.
CREATE TABLE IF NOT EXISTS site_family_pdf (
  family_key         text        NOT NULL,
  fingerprint        char(64)    PRIMARY KEY CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint char(64)    NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  photo_shas         jsonb       NOT NULL CHECK (jsonb_typeof(photo_shas) = 'array'),
  pdf_bytes          bytea       NOT NULL CHECK (octet_length(pdf_bytes) BETWEEN 1 AND 5242880),
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS site_family_pdf_lookup ON site_family_pdf (family_key, source_fingerprint);
CREATE INDEX IF NOT EXISTS site_family_pdf_expiry ON site_family_pdf (expires_at);
COMMENT ON TABLE site_family_pdf IS 'CA-8d - fiches publiques conservées 1 à 365 jours ; purge opportuniste bornée par le SITE';
