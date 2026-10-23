-- BC4 : outbox site_events.v1 (C0 §11). `event_bytes` = octets canoniques EXACTS servis au poll.
-- Aucune donnée personnelle : le payload est construit à partir des lignes figées seulement.
CREATE TABLE site_outbox_event (
  id                 bigserial   PRIMARY KEY,
  event_id           text        NOT NULL UNIQUE CHECK (event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  event_type         text        NOT NULL CHECK (event_type IN ('quote.requested', 'order.received')),
  event_version      integer     NOT NULL CHECK (event_version = 1),
  created_at_utc     text        NOT NULL CHECK (created_at_utc ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'),
  object_ref         text        NOT NULL CHECK (object_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  idempotency_key    text        NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  catalogue_sequence bigint      NULL CHECK (catalogue_sequence >= 1),
  payload            jsonb       NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_digest     char(64)    NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  event_bytes        bytea       NOT NULL CHECK (octet_length(event_bytes) BETWEEN 2 AND 262144),
  status             text        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED_TO_POLL', 'ACKED')),
  delivery_count     integer     NOT NULL DEFAULT 0 CHECK (delivery_count >= 0),
  delivered_at       timestamptz NULL,
  acked_at           timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, idempotency_key),
  UNIQUE (event_type, object_ref),
  CHECK (status <> 'ACKED' OR (acked_at IS NOT NULL AND delivered_at IS NOT NULL)),
  CHECK (status = 'PENDING' OR delivered_at IS NOT NULL)
);
CREATE INDEX site_outbox_event_unacked ON site_outbox_event (id) WHERE status <> 'ACKED';

-- Contenu immuable ; statut monotone PENDING -> DELIVERED_TO_POLL -> ACKED ; ACKED est final.
CREATE FUNCTION site_outbox_event_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_outbox_event : suppression refusée';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'delivery_count', 'delivered_at', 'acked_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'delivery_count', 'delivered_at', 'acked_at']) THEN
    RAISE EXCEPTION 'site_outbox_event : contenu immuable (event_bytes, payload, digest)';
  END IF;
  IF OLD.status = 'ACKED' AND NEW.status <> 'ACKED' THEN
    RAISE EXCEPTION 'site_outbox_event : ACKED est final';
  END IF;
  IF OLD.status = 'DELIVERED_TO_POLL' AND NEW.status = 'PENDING' THEN
    RAISE EXCEPTION 'site_outbox_event : retour à PENDING refusé';
  END IF;
  IF NEW.delivery_count < OLD.delivery_count THEN
    RAISE EXCEPTION 'site_outbox_event : delivery_count décroissant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_outbox_event_transition BEFORE UPDATE OR DELETE ON site_outbox_event
  FOR EACH ROW EXECUTE FUNCTION site_outbox_event_transition();
CREATE TRIGGER site_outbox_event_no_truncate BEFORE TRUNCATE ON site_outbox_event
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_outbox_event IS 'BC4 - outbox site_events.v1, octets canoniques exacts, sans PII';
