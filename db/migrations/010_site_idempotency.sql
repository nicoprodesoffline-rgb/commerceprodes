-- BC4 : registre d'idempotence durable de site_business.v1 (C0 §10.4).
-- L'unicité (kind, idempotency_key) est l'autorité contre deux POST concurrents (CE-T03).
-- Aucune donnée personnelle : la clé, l'empreinte, la référence et le reçu (sans contact, sans jeton).
CREATE TABLE site_idempotency (
  kind                text        NOT NULL CHECK (kind IN ('quote_request', 'order')),
  idempotency_key     text        NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_fingerprint char(64)    NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  receipt_ref         text        NOT NULL UNIQUE CHECK (receipt_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  receipt_json        jsonb       NOT NULL CHECK (jsonb_typeof(receipt_json) = 'object'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, idempotency_key)
);

CREATE FUNCTION site_bc4_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% est immuable (BC4)', TG_TABLE_NAME;
END $$;
CREATE TRIGGER site_idempotency_immutable BEFORE UPDATE OR DELETE ON site_idempotency
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_idempotency_no_truncate BEFORE TRUNCATE ON site_idempotency
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_idempotency IS 'BC4 - registre d''idempotence (kind, idempotency_key), sans PII, immuable';
