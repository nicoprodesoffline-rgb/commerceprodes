-- BC4 : curseurs de poll opaques ÉMIS par le SITE (C0 §11.3 : un curseur jamais émis -> CURSOR_INVALID).
-- `event_ids` = événements servis sous ce curseur (ACK par curseur sans ambiguïté, même avec des trous d'id).
CREATE TABLE site_event_cursor (
  cursor            text        PRIMARY KEY CHECK (cursor ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  credential_key_id text        NOT NULL CHECK (credential_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  position          bigint      NOT NULL CHECK (position >= 0),
  event_ids         text[]      NOT NULL,
  issued_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_event_cursor_key ON site_event_cursor (credential_key_id);
CREATE TRIGGER site_event_cursor_immutable BEFORE UPDATE OR DELETE ON site_event_cursor
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_event_cursor_no_truncate BEFORE TRUNCATE ON site_event_cursor
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_event_cursor IS 'BC4 - curseurs opaques émis par le SITE, liés à une clé site_events.read';
