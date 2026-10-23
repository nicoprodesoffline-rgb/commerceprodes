-- BC2 : journal append-only des opérations de publication, corrélé par publication_id/catalogue_sequence.
-- SANS PII, SANS secret, SANS octets (ni snapshot, ni média, ni signature).
CREATE TABLE site_publication_log (
  id                 bigserial   PRIMARY KEY,
  at                 timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation          text        NOT NULL CHECK (operation IN ('STAGE','MEDIA_PUT','VERIFY_MEDIA','ACTIVATE','ACTIVATE_ABORTED','STATUS')),
  publication_id     text,
  catalogue_sequence bigint,
  payload_sha256     char(64),
  outcome            text        NOT NULL,
  error_codes        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  stage              text,
  detail             jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX site_publication_log_correlation ON site_publication_log (publication_id, catalogue_sequence);

CREATE FUNCTION site_publication_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'site_publication_log est append-only';
END $$;
CREATE TRIGGER site_publication_log_no_update BEFORE UPDATE OR DELETE ON site_publication_log
  FOR EACH ROW EXECUTE FUNCTION site_publication_log_append_only();
CREATE TRIGGER site_publication_log_no_truncate BEFORE TRUNCATE ON site_publication_log
  FOR EACH STATEMENT EXECUTE FUNCTION site_publication_log_append_only();

COMMENT ON TABLE site_publication_log IS 'BC2 - journal append-only, sans PII, sans secret, sans octets';
