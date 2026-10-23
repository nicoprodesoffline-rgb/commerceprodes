-- BC2 : générations publiées reçues par le SITE (C0 site_snapshot.v1 / site_activation.v1).
-- Les octets reçus (snapshot_bytes) sont la vérité ; snapshot_json n'est qu'une vue requêtable.
CREATE TABLE site_generation (
  id                 bigserial PRIMARY KEY,
  publication_id     text        NOT NULL,
  projection_id      text        NOT NULL,
  scope_key          text        NOT NULL,
  catalogue_sequence bigint      NOT NULL CHECK (catalogue_sequence >= 1),
  payload_sha256     char(64)    NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_bytes     bytea       NOT NULL,
  snapshot_json      jsonb       NOT NULL,
  transport_json     jsonb       NOT NULL,
  status             text        NOT NULL CHECK (status IN ('STAGED','VERIFIED','ACTIVE','SUPERSEDED','REJECTED','HOLD')),
  last_result        jsonb,
  staged_at          timestamptz NOT NULL,
  verified_at        timestamptz,
  activated_at       timestamptz,
  ack_json           jsonb,
  ack_bytes          bytea,
  UNIQUE (catalogue_sequence, payload_sha256),
  -- une génération ACTIVE ou SUPERSEDED a été activée : elle porte son ACK (octets canoniques) et son instant
  CONSTRAINT site_generation_activated_has_ack CHECK (
    status NOT IN ('ACTIVE','SUPERSEDED')
    OR (ack_json IS NOT NULL AND ack_bytes IS NOT NULL AND activated_at IS NOT NULL)
  ),
  CONSTRAINT site_generation_ack_pair CHECK ((ack_json IS NULL) = (ack_bytes IS NULL))
);

-- Défense en profondeur : au plus UNE génération ACTIVE à tout instant.
CREATE UNIQUE INDEX site_generation_single_active ON site_generation ((true)) WHERE status = 'ACTIVE';
CREATE INDEX site_generation_publication ON site_generation (publication_id, catalogue_sequence);

COMMENT ON TABLE site_generation IS 'BC2 - générations site_snapshot.v1 reçues (STAGED/VERIFIED/ACTIVE/SUPERSEDED/REJECTED/HOLD)';
COMMENT ON COLUMN site_generation.snapshot_bytes IS 'octets canoniques reçus, vérité (C0 §4) ; jamais journalisés';
COMMENT ON COLUMN site_generation.transport_json IS 'en-têtes de transport {key_id, signature} reçus au STAGE (aucun secret)';
COMMENT ON COLUMN site_generation.ack_bytes IS 'octets canoniques de l''ACK signé, renvoyés tels quels en REPLAY_ACK';
