-- BC2 : pointeur de la génération ACTIVE. UNE seule ligne (singleton = 1), verrouillée FOR UPDATE
-- à chaque activation ; lue FOR SHARE par les transactions BC4 (lib/site-db/generation.ts).
CREATE TABLE site_active_pointer (
  singleton          smallint PRIMARY KEY CHECK (singleton = 1),
  generation_id      bigint REFERENCES site_generation (id),
  catalogue_sequence bigint,
  payload_sha256     char(64),
  activated_at       timestamptz,
  CONSTRAINT site_active_pointer_all_or_nothing CHECK (
    (generation_id IS NULL AND catalogue_sequence IS NULL AND payload_sha256 IS NULL AND activated_at IS NULL)
    OR (generation_id IS NOT NULL AND catalogue_sequence IS NOT NULL AND payload_sha256 IS NOT NULL AND activated_at IS NOT NULL)
  )
);
INSERT INTO site_active_pointer (singleton) VALUES (1);

-- La ligne unique ne disparaît jamais.
CREATE FUNCTION site_active_pointer_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'site_active_pointer: la ligne unique ne se supprime pas';
END $$;
CREATE TRIGGER site_active_pointer_no_delete BEFORE DELETE ON site_active_pointer
  FOR EACH ROW EXECUTE FUNCTION site_active_pointer_no_delete();
CREATE TRIGGER site_active_pointer_no_truncate BEFORE TRUNCATE ON site_active_pointer
  FOR EACH STATEMENT EXECUTE FUNCTION site_active_pointer_no_delete();

COMMENT ON TABLE site_active_pointer IS 'BC2 - pointeur ACTIVE unique ; FOR UPDATE à chaque activation';
