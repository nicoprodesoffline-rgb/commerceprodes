-- BC4 : journal append-only des opérations transactionnelles. SANS PII (ni contact, ni message),
-- SANS secret (ni jeton d'accès, ni signature), SANS clé d'idempotence client.
CREATE TABLE site_transaction_log (
  id          bigserial   PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation   text        NOT NULL CHECK (operation IN ('QUOTE', 'ORDER', 'RECEIPT', 'EVENTS_POLL', 'EVENTS_ACK')),
  outcome     text        NOT NULL,
  error_codes jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(error_codes) = 'array'),
  object_ref  text        NULL CHECK (object_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object')
);
CREATE TRIGGER site_transaction_log_append_only BEFORE UPDATE OR DELETE ON site_transaction_log
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_transaction_log_no_truncate BEFORE TRUNCATE ON site_transaction_log
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_transaction_log IS 'BC4 - journal append-only, sans PII, sans secret';
