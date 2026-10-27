-- BC4 / W4 lot I (DF-0115) : anti-rejeu du poll des événements et purge des curseurs. Hors C0 (transport de staging).
--
-- 1. site_event_poll_nonce : nonces de poll déjà vus, par clé site_events.read. Un poll signé porte issued_at_utc + nonce
--    (domaine prodes.c0.transport.events_poll.v2) ; un nonce déjà vu -> 401 POLL_REPLAYED. Une ligne n'est jamais modifiée ;
--    elle n'est supprimée que par site_purge_event_cursors (issued_at plus ancien que la rétention, >= 1 h >= fenêtre max).
-- 2. site_event_cursor : le trigger « immuable » de 014 est remplacé par une garde qui refuse toujours UPDATE et n'admet
--    DELETE que pendant site_purge_event_cursors (paramètre de transaction site.event_cursor_purge). TRUNCATE reste refusé
--    (trigger site_event_cursor_no_truncate de 014, inchangé). La garde protège d'une erreur, pas d'un administrateur.
-- 3. site_purge_event_cursors(rétention curseurs, rétention nonces, simulation) : supprime les curseurs émis avant
--    now() - rétention, SAUF le plus récent de chaque clé, et les nonces émis avant now() - rétention. Rétention < 1 h refusée.
CREATE TABLE site_event_poll_nonce (
  credential_key_id text        NOT NULL CHECK (credential_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  nonce             char(32)    NOT NULL CHECK (nonce ~ '^[0-9a-f]{32}$'),
  issued_at         timestamptz NOT NULL,
  seen_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_key_id, nonce)
);
CREATE INDEX site_event_poll_nonce_issued ON site_event_poll_nonce (issued_at);

CREATE FUNCTION site_event_purge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('site.event_cursor_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% : immuable hors purge (site_purge_event_cursors)', TG_TABLE_NAME;
END $$;

CREATE TRIGGER site_event_poll_nonce_guard BEFORE UPDATE OR DELETE ON site_event_poll_nonce
  FOR EACH ROW EXECUTE FUNCTION site_event_purge_guard();
CREATE TRIGGER site_event_poll_nonce_no_truncate BEFORE TRUNCATE ON site_event_poll_nonce
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

DROP TRIGGER site_event_cursor_immutable ON site_event_cursor;
CREATE TRIGGER site_event_cursor_guard BEFORE UPDATE OR DELETE ON site_event_cursor
  FOR EACH ROW EXECUTE FUNCTION site_event_purge_guard();
CREATE INDEX site_event_cursor_issued ON site_event_cursor (issued_at);

CREATE FUNCTION site_purge_event_cursors(p_cursor_retention interval, p_nonce_retention interval, p_dry_run boolean DEFAULT false)
RETURNS TABLE (cursors_deleted bigint, cursors_kept bigint, nonces_deleted bigint) LANGUAGE plpgsql AS $$
DECLARE
  doomed_cursors text[];
  doomed_nonces  bigint;
BEGIN
  IF p_cursor_retention IS NULL OR p_nonce_retention IS NULL OR p_cursor_retention < interval '1 hour' OR p_nonce_retention < interval '1 hour' THEN
    RAISE EXCEPTION 'site_purge_event_cursors : rétention inférieure à 1 heure refusée';
  END IF;
  SELECT coalesce(array_agg(c.cursor), ARRAY[]::text[]) INTO doomed_cursors
    FROM site_event_cursor c
   WHERE c.issued_at < now() - p_cursor_retention
     AND c.cursor NOT IN (SELECT DISTINCT ON (l.credential_key_id) l.cursor FROM site_event_cursor l
                           ORDER BY l.credential_key_id, l.issued_at DESC, l.cursor DESC);
  SELECT count(*) INTO doomed_nonces FROM site_event_poll_nonce n WHERE n.issued_at < now() - p_nonce_retention;
  IF NOT p_dry_run THEN
    PERFORM set_config('site.event_cursor_purge', 'on', true);
    DELETE FROM site_event_cursor WHERE cursor = ANY (doomed_cursors);
    DELETE FROM site_event_poll_nonce n WHERE n.issued_at < now() - p_nonce_retention;
    PERFORM set_config('site.event_cursor_purge', 'off', true);
  END IF;
  RETURN QUERY SELECT cardinality(doomed_cursors)::bigint,
                      (SELECT count(*) FROM site_event_cursor)::bigint - CASE WHEN p_dry_run THEN cardinality(doomed_cursors) ELSE 0 END,
                      doomed_nonces;
END $$;

COMMENT ON TABLE site_event_poll_nonce IS 'BC4/W4-I - nonces de poll vus (anti-rejeu DF-0115), purgés par site_purge_event_cursors';
COMMENT ON FUNCTION site_purge_event_cursors(interval, interval, boolean) IS 'BC4/W4-I - purge des curseurs de poll (sauf le dernier par clé) et des nonces (DF-0115)';
