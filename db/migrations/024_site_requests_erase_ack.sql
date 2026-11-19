-- Cercle 5 (5.3, 5.4, 5.17, 5.22, 5.25 ; docs/site_events_v2.md §5 à §7) : effacement des coordonnées, acquittement, mise de côté, PDF déposé par la
-- Factory et file de l'accusé au client. Les lignes et les montants restent figés (attendu D08) : seuls les gestes nommés ci-dessous passent la base.

-- 1. Le PDF de la Factory (§5.2), sur le devis et la commande. Les quatre colonnes vont ensemble ; l'effacement les remet à NULL.
ALTER TABLE site_quote_request
  ADD COLUMN document_kind         text        NULL CHECK (document_kind = 'demande_de_devis'),
  ADD COLUMN document_pdf          bytea       NULL CHECK (octet_length(document_pdf) BETWEEN 5 AND 2097152),
  ADD COLUMN document_sha256       char(64)    NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN document_deposited_at timestamptz NULL,
  ADD CONSTRAINT site_quote_request_document_together CHECK (
    (document_kind IS NULL) = (document_pdf IS NULL) AND (document_pdf IS NULL) = (document_sha256 IS NULL) AND (document_sha256 IS NULL) = (document_deposited_at IS NULL));
ALTER TABLE site_order
  ADD COLUMN document_kind         text        NULL CHECK (document_kind = 'bon_de_commande'),
  ADD COLUMN document_pdf          bytea       NULL CHECK (octet_length(document_pdf) BETWEEN 5 AND 2097152),
  ADD COLUMN document_sha256       char(64)    NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN document_deposited_at timestamptz NULL,
  ADD CONSTRAINT site_order_document_together CHECK (
    (document_kind IS NULL) = (document_pdf IS NULL) AND (document_pdf IS NULL) = (document_sha256 IS NULL) AND (document_sha256 IS NULL) = (document_deposited_at IS NULL));

-- Le message d'une demande libre devient effaçable (sa règle de longueur ne vaut que pour un texte présent).
ALTER TABLE site_message ALTER COLUMN message DROP NOT NULL;

-- 2. Garde des trois tables de demande (G6). Hors des colonnes nommées, rien ne change ; et :
--    - effacement : une fois, coordinates_erased_at posé, contact = {}, message, adresses, références et PDF à NULL ; ensuite rien ne revient ;
--    - acked_at et set_aside_at : posés une fois, jamais modifiés ;
--    - PDF : déposé ou remplacé tant que les coordonnées ne sont pas effacées ;
--    - commande : la transition de statut RECEIVED -> PENDING_REVIEW de la migration 012 reste admise.
CREATE FUNCTION site_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  movable text[] := ARRAY['contact', 'message', 'addresses', 'customer_refs', 'coordinates_erased_at', 'acked_at', 'set_aside_at',
                          'document_kind', 'document_pdf', 'document_sha256', 'document_deposited_at', 'status'];
  o jsonb;
  n jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% est immuable (suppression refusée)', TG_TABLE_NAME;
  END IF;
  o := to_jsonb(OLD);
  n := to_jsonb(NEW);
  IF (n - movable) IS DISTINCT FROM (o - movable) THEN
    RAISE EXCEPTION '% : contenu figé (lignes, montants, numéro, références) ; seuls le statut et les gestes du cercle 5 passent', TG_TABLE_NAME;
  END IF;
  IF (n ->> 'status') IS DISTINCT FROM (o ->> 'status')
     AND NOT (TG_TABLE_NAME = 'site_order' AND o ->> 'status' = 'RECEIVED' AND n ->> 'status' = 'PENDING_REVIEW') THEN
    RAISE EXCEPTION '% : seule la transition de statut RECEIVED -> PENDING_REVIEW d''une commande est admise', TG_TABLE_NAME;
  END IF;
  IF o ? 'acked_at' AND (o -> 'acked_at') <> 'null'::jsonb AND (n -> 'acked_at') IS DISTINCT FROM (o -> 'acked_at') THEN
    RAISE EXCEPTION '% : acked_at est posé une fois', TG_TABLE_NAME;
  END IF;
  IF o ? 'set_aside_at' AND (o -> 'set_aside_at') <> 'null'::jsonb AND (n -> 'set_aside_at') IS DISTINCT FROM (o -> 'set_aside_at') THEN
    RAISE EXCEPTION '% : set_aside_at est posé une fois', TG_TABLE_NAME;
  END IF;
  IF (o -> 'coordinates_erased_at') <> 'null'::jsonb THEN
    -- Déjà effacée : plus rien des données personnelles ni du PDF ne bouge.
    IF (n -> 'coordinates_erased_at') IS DISTINCT FROM (o -> 'coordinates_erased_at')
       OR (n -> 'contact') IS DISTINCT FROM (o -> 'contact') OR (n -> 'message') IS DISTINCT FROM (o -> 'message')
       OR (n -> 'addresses') IS DISTINCT FROM (o -> 'addresses') OR (n -> 'customer_refs') IS DISTINCT FROM (o -> 'customer_refs')
       OR (n -> 'document_pdf') IS DISTINCT FROM (o -> 'document_pdf') THEN
      RAISE EXCEPTION '% : coordonnées déjà effacées', TG_TABLE_NAME;
    END IF;
  ELSIF (n -> 'coordinates_erased_at') <> 'null'::jsonb THEN
    -- L'effacement : tout ce qui est personnel part en une fois.
    IF (n -> 'contact') IS DISTINCT FROM '{}'::jsonb OR coalesce(n -> 'message', 'null'::jsonb) <> 'null'::jsonb
       OR coalesce(n -> 'addresses', 'null'::jsonb) <> 'null'::jsonb OR coalesce(n -> 'customer_refs', 'null'::jsonb) <> 'null'::jsonb
       OR coalesce(n -> 'document_pdf', 'null'::jsonb) <> 'null'::jsonb THEN
      RAISE EXCEPTION '% : un effacement remet contact à {} et message, adresses, références et PDF à NULL', TG_TABLE_NAME;
    END IF;
  ELSE
    -- Ni effacée ni en train de l'être : les données personnelles ne changent pas.
    IF (n -> 'contact') IS DISTINCT FROM (o -> 'contact') OR (n -> 'message') IS DISTINCT FROM (o -> 'message')
       OR (n -> 'addresses') IS DISTINCT FROM (o -> 'addresses') OR (n -> 'customer_refs') IS DISTINCT FROM (o -> 'customer_refs') THEN
      RAISE EXCEPTION '% : les coordonnées ne changent que par effacement', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER site_quote_request_immutable ON site_quote_request;
DROP TRIGGER site_order_status_only ON site_order;
DROP TRIGGER site_message_immutable ON site_message;
CREATE TRIGGER site_quote_request_guard BEFORE UPDATE OR DELETE ON site_quote_request FOR EACH ROW EXECUTE FUNCTION site_request_guard();
CREATE TRIGGER site_order_guard BEFORE UPDATE OR DELETE ON site_order FOR EACH ROW EXECUTE FUNCTION site_request_guard();
CREATE TRIGGER site_message_guard BEFORE UPDATE OR DELETE ON site_message FOR EACH ROW EXECUTE FUNCTION site_request_guard();

-- 3. L'outbox : un événement v2 est effaçable (ses octets portent les coordonnées) et peut être mis de côté (P06).
ALTER TABLE site_outbox_event
  ADD COLUMN erased_at      timestamptz NULL,
  ADD COLUMN set_aside_at   timestamptz NULL,
  ADD COLUMN set_aside_code text        NULL CHECK (set_aside_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  ADD CONSTRAINT site_outbox_event_erased_v2 CHECK (erased_at IS NULL OR (contract_version = 'site_events.v2' AND payload = '{}'::jsonb AND event_bytes = '\x7b7d'::bytea)),
  ADD CONSTRAINT site_outbox_event_set_aside CHECK ((status = 'SET_ASIDE') = (set_aside_at IS NOT NULL) AND (set_aside_at IS NULL) = (set_aside_code IS NULL));
ALTER TABLE site_outbox_event DROP CONSTRAINT site_outbox_event_status_check;
ALTER TABLE site_outbox_event ADD CONSTRAINT site_outbox_event_status_check CHECK (status IN ('PENDING', 'DELIVERED_TO_POLL', 'ACKED', 'SET_ASIDE'));
-- Migration 013 : « PENDING ou livré ». Un événement peut être mis de côté sans avoir été livré.
ALTER TABLE site_outbox_event DROP CONSTRAINT site_outbox_event_check1;
ALTER TABLE site_outbox_event ADD CONSTRAINT site_outbox_event_delivered CHECK (status IN ('PENDING', 'SET_ASIDE') OR delivered_at IS NOT NULL);
DROP INDEX site_outbox_event_unacked;
CREATE INDEX site_outbox_event_unacked ON site_outbox_event (id) WHERE status IN ('PENDING', 'DELIVERED_TO_POLL') AND erased_at IS NULL;

-- Contenu immuable, sauf l'effacement d'un v2 ; statut monotone PENDING -> DELIVERED_TO_POLL -> ACKED, ou -> SET_ASIDE ; ACKED et SET_ASIDE sont finals.
CREATE OR REPLACE FUNCTION site_outbox_event_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  movable text[] := ARRAY['status', 'delivery_count', 'delivered_at', 'acked_at', 'erased_at', 'set_aside_at', 'set_aside_code', 'payload', 'event_bytes'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_outbox_event : suppression refusée';
  END IF;
  IF (to_jsonb(NEW) - movable) IS DISTINCT FROM (to_jsonb(OLD) - movable) THEN
    RAISE EXCEPTION 'site_outbox_event : contenu immuable (event_bytes, payload, digest)';
  END IF;
  IF OLD.erased_at IS NOT NULL AND NEW.erased_at IS DISTINCT FROM OLD.erased_at THEN
    RAISE EXCEPTION 'site_outbox_event : erased_at est posé une fois';
  END IF;
  IF (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.event_bytes IS DISTINCT FROM OLD.event_bytes)
     AND NOT (OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL) THEN
    RAISE EXCEPTION 'site_outbox_event : contenu immuable (event_bytes, payload, digest)';
  END IF;
  IF OLD.status IN ('ACKED', 'SET_ASIDE') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'site_outbox_event : % est final', OLD.status;
  END IF;
  IF OLD.status = 'DELIVERED_TO_POLL' AND NEW.status = 'PENDING' THEN
    RAISE EXCEPTION 'site_outbox_event : retour à PENDING refusé';
  END IF;
  IF NEW.delivery_count < OLD.delivery_count THEN
    RAISE EXCEPTION 'site_outbox_event : delivery_count décroissant';
  END IF;
  IF OLD.set_aside_at IS NOT NULL AND (NEW.set_aside_at IS DISTINCT FROM OLD.set_aside_at OR NEW.set_aside_code IS DISTINCT FROM OLD.set_aside_code) THEN
    RAISE EXCEPTION 'site_outbox_event : la mise de côté est posée une fois';
  END IF;
  RETURN NEW;
END $$;

-- 4. La file de l'accusé au client (5.17, décision B2 : il part du site). Un envoi par demande ; destinataire, objet et corps sont effacés avec
--    les coordonnées. États : gardé (mode « gardés » : fabriqué, rangé, rien ne sort), à envoyer, envoyé, refusé, sans réponse.
CREATE TABLE site_ack_mail (
  id              bigserial   PRIMARY KEY,
  object_ref      text        NOT NULL UNIQUE CHECK (object_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  event_type      text        NOT NULL CHECK (event_type IN ('quote.requested', 'order.received', 'message.received')),
  number          text        NOT NULL CHECK (number ~ '^(DEV|CMD|MSG)-[0-9]{4}-[0-9]{6}$'),
  mode            text        NOT NULL CHECK (mode IN ('garde', 'smtp')),
  state           text        NOT NULL CHECK (state IN ('garde', 'a_envoyer', 'envoye', 'refuse', 'sans_reponse')),
  recipient       text        NULL,
  subject         text        NULL,
  body            text        NULL,
  attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at timestamptz NULL,
  last_attempt_at timestamptz NULL,
  next_attempt_at timestamptz NULL,
  sent_at         timestamptz NULL,
  last_error      text        NULL CHECK (last_error ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  erased_at       timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((erased_at IS NULL) = (recipient IS NOT NULL AND subject IS NOT NULL AND body IS NOT NULL)),
  CHECK ((mode = 'garde') = (state = 'garde')),
  CHECK (state <> 'envoye' OR sent_at IS NOT NULL),
  CHECK (state <> 'a_envoyer' OR next_attempt_at IS NOT NULL)
);
CREATE INDEX site_ack_mail_due ON site_ack_mail (next_attempt_at) WHERE state = 'a_envoyer';

CREATE FUNCTION site_ack_mail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  movable text[] := ARRAY['state', 'recipient', 'subject', 'body', 'attempts', 'first_attempt_at', 'last_attempt_at', 'next_attempt_at', 'sent_at', 'last_error', 'erased_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_ack_mail : suppression refusée';
  END IF;
  IF (to_jsonb(NEW) - movable) IS DISTINCT FROM (to_jsonb(OLD) - movable) THEN
    RAISE EXCEPTION 'site_ack_mail : référence, type, numéro et mode figés';
  END IF;
  IF OLD.erased_at IS NOT NULL AND (NEW.erased_at IS DISTINCT FROM OLD.erased_at OR NEW.recipient IS NOT NULL OR NEW.subject IS NOT NULL OR NEW.body IS NOT NULL) THEN
    RAISE EXCEPTION 'site_ack_mail : déjà effacé';
  END IF;
  IF OLD.erased_at IS NULL AND NEW.erased_at IS NULL
     AND (NEW.recipient IS DISTINCT FROM OLD.recipient OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body) THEN
    RAISE EXCEPTION 'site_ack_mail : le message ne change que par effacement';
  END IF;
  IF OLD.state IN ('envoye', 'refuse', 'sans_reponse', 'garde') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'site_ack_mail : % est final', OLD.state;
  END IF;
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'site_ack_mail : attempts décroissant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_ack_mail_guard BEFORE UPDATE OR DELETE ON site_ack_mail FOR EACH ROW EXECUTE FUNCTION site_ack_mail_guard();
CREATE TRIGGER site_ack_mail_no_truncate BEFORE TRUNCATE ON site_ack_mail FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();
COMMENT ON TABLE site_ack_mail IS 'Cercle 5 - file de l''accusé au client ; destinataire, objet et corps = données personnelles, effacés avec les coordonnées';

-- 5. L'effacement d'une demande, partout où ses données personnelles vivent : la ligne, l'événement v2, l'accusé. Idempotent : rend l'instant
--    d'effacement (le premier), ou NULL si la référence est inconnue.
CREATE FUNCTION site_erase_request(ref text) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE
  done timestamptz;
BEGIN
  SELECT coordinates_erased_at INTO done FROM (
    SELECT quote_ref AS r, coordinates_erased_at FROM site_quote_request WHERE quote_ref = ref
    UNION ALL SELECT order_ref, coordinates_erased_at FROM site_order WHERE order_ref = ref
    UNION ALL SELECT message_ref, coordinates_erased_at FROM site_message WHERE message_ref = ref) AS found;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF done IS NOT NULL THEN
    RETURN done;
  END IF;
  done := now();
  UPDATE site_quote_request SET contact = '{}'::jsonb, message = NULL, coordinates_erased_at = done,
         document_kind = NULL, document_pdf = NULL, document_sha256 = NULL, document_deposited_at = NULL WHERE quote_ref = ref;
  UPDATE site_order SET contact = '{}'::jsonb, addresses = NULL, customer_refs = NULL, coordinates_erased_at = done,
         document_kind = NULL, document_pdf = NULL, document_sha256 = NULL, document_deposited_at = NULL WHERE order_ref = ref;
  UPDATE site_message SET contact = '{}'::jsonb, message = NULL, coordinates_erased_at = done WHERE message_ref = ref;
  UPDATE site_outbox_event SET payload = '{}'::jsonb, event_bytes = '\x7b7d'::bytea, erased_at = done
   WHERE object_ref = ref AND contract_version = 'site_events.v2' AND erased_at IS NULL;
  UPDATE site_ack_mail SET recipient = NULL, subject = NULL, body = NULL, erased_at = done,
         state = CASE WHEN state = 'a_envoyer' THEN 'sans_reponse' ELSE state END, next_attempt_at = NULL
   WHERE object_ref = ref AND erased_at IS NULL;
  RETURN done;
END $$;

-- 6. Conservation (5.3, attendus D05 et D06) : trente jours après l'acquittement, la demande est effacée ; une demande jamais acquittée ne l'est pas.
CREATE FUNCTION site_purge_acknowledged_requests(retention interval) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  ref text;
  erased integer := 0;
BEGIN
  IF retention < interval '1 day' THEN
    RAISE EXCEPTION 'site_purge_acknowledged_requests : rétention d''au moins un jour';
  END IF;
  FOR ref IN
    SELECT quote_ref FROM site_quote_request WHERE acked_at < now() - retention AND coordinates_erased_at IS NULL
    UNION ALL SELECT order_ref FROM site_order WHERE acked_at < now() - retention AND coordinates_erased_at IS NULL
    UNION ALL SELECT message_ref FROM site_message WHERE acked_at < now() - retention AND coordinates_erased_at IS NULL
  LOOP
    PERFORM site_erase_request(ref);
    erased := erased + 1;
  END LOOP;
  RETURN erased;
END $$;

ALTER TABLE site_transaction_log DROP CONSTRAINT site_transaction_log_operation_check;
ALTER TABLE site_transaction_log ADD CONSTRAINT site_transaction_log_operation_check
  CHECK (operation IN ('QUOTE', 'ORDER', 'MESSAGE', 'RECEIPT', 'EVENTS_POLL', 'EVENTS_ACK',
                       'REQUESTS_ERASE', 'REQUESTS_DOCUMENT', 'EVENTS_SET_ASIDE', 'REQUESTS_MAIL_STATUS', 'REQUESTS_PURGE', 'ACK_MAIL'));
