-- Cercle 5 (5.21) : les réglages de vente `site_commerce.v1` reçus par le canal signé (taux de TVA, livraison sur rendez-vous, marches à suivre des règlements, mention d'information,
-- version des CGV, textes de l'accusé). Un seul état ACTIF : les octets canoniques du dernier document accepté et son accusé signé ; un refus laisse servis les réglages précédents.
-- Sans ligne, le site ne prend ni devis ni commande en v2 (« la boutique n'est pas prête »).
CREATE TABLE site_commerce_active (
  singleton         smallint    PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  commerce_sequence bigint      NOT NULL CHECK (commerce_sequence >= 1),
  publication_id    text        NOT NULL,
  payload_sha256    char(64)    NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  document_bytes    bytea       NOT NULL,
  ack_bytes         bytea       NOT NULL,
  activated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE site_commerce_active IS 'Cercle 5 - réglages de vente actifs (octets canoniques + accusé) ; une seule ligne, remplacée à chaque activation acceptée';

ALTER TABLE site_publication_log DROP CONSTRAINT site_publication_log_operation_check;
ALTER TABLE site_publication_log ADD CONSTRAINT site_publication_log_operation_check
  CHECK (operation IN ('STAGE','MEDIA_PUT','VERIFY_MEDIA','ACTIVATE','ACTIVATE_ABORTED','STATUS','CONTENT','COMMERCE'));
