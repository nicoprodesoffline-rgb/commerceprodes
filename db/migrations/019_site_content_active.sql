-- Cercle 3 (3.2) : les contenus v2 (réglages de la boutique, bandeau, maintenance, redirections, pages, relations) reçus par le canal signé, comme le catalogue :
-- un seul état ACTIF (les octets canoniques du dernier document accepté et son accusé signé) ; un refus laisse servis les contenus précédents.
CREATE TABLE site_content_active (
  singleton        smallint    PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  content_sequence bigint      NOT NULL CHECK (content_sequence >= 1),
  publication_id   text        NOT NULL,
  payload_sha256   char(64)    NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  content_bytes    bytea       NOT NULL,
  ack_bytes        bytea       NOT NULL,
  activated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE site_content_active IS 'Cercle 3 - contenus v2 actifs (octets canoniques + accusé) ; une seule ligne, remplacée à chaque activation acceptée';

ALTER TABLE site_publication_log DROP CONSTRAINT site_publication_log_operation_check;
ALTER TABLE site_publication_log ADD CONSTRAINT site_publication_log_operation_check
  CHECK (operation IN ('STAGE','MEDIA_PUT','VERIFY_MEDIA','ACTIVATE','ACTIVATE_ABORTED','STATUS','CONTENT'));
