-- Cercle 5 (5.1, 5.5 à 5.14, 5.9, 5.10) : les demandes avec coordonnées (docs/site_events_v2.md). Colonnes posées à l'INSERT seulement (lignes déjà figées par les déclencheurs de 011/012 ; les gestes
-- d'effacement, d'acquittement et de mise de côté sont les déclencheurs de la migration suivante). Colonnes nullables : une demande v1 d'avant le cercle garde sa forme.

-- Numéros lisibles DEV-/CMD-/MSG-AAAA-NNNNNN : un compteur par (préfixe, année), pris DANS la transaction de la demande (un retour en arrière le rend : aucun trou visible), verrou de ligne : deux demandes simultanées reçoivent deux numéros consécutifs.
CREATE TABLE site_number_counter (
  prefix text     NOT NULL CHECK (prefix IN ('DEV', 'CMD', 'MSG')),
  year   integer  NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  last   integer  NOT NULL CHECK (last >= 1 AND last <= 999999),
  PRIMARY KEY (prefix, year)
);
COMMENT ON TABLE site_number_counter IS 'Cercle 5 - dernier numéro attribué par (préfixe, année) ; incrémenté dans la transaction de la demande';

ALTER TABLE site_quote_request
  ADD COLUMN number               text        NULL UNIQUE CHECK (number ~ '^DEV-[0-9]{4}-[0-9]{6}$'),
  ADD COLUMN privacy_notice       text        NULL CHECK (privacy_notice IS NULL OR char_length(privacy_notice) BETWEEN 1 AND 40),
  ADD COLUMN delivery             jsonb       NULL CHECK (delivery IS NULL OR jsonb_typeof(delivery) = 'object'),
  ADD COLUMN amounts              jsonb       NULL CHECK (amounts IS NULL OR jsonb_typeof(amounts) = 'object'),
  ADD COLUMN commerce_sequence    bigint      NULL CHECK (commerce_sequence IS NULL OR commerce_sequence >= 1),
  ADD COLUMN extras_fingerprint   char(64)    NULL CHECK (extras_fingerprint IS NULL OR extras_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD COLUMN coordinates_erased_at timestamptz NULL,
  ADD COLUMN acked_at             timestamptz NULL,
  ADD COLUMN set_aside_at         timestamptz NULL;

ALTER TABLE site_order
  ADD COLUMN number               text        NULL UNIQUE CHECK (number ~ '^CMD-[0-9]{4}-[0-9]{6}$'),
  ADD COLUMN privacy_notice       text        NULL CHECK (privacy_notice IS NULL OR char_length(privacy_notice) BETWEEN 1 AND 40),
  ADD COLUMN addresses            jsonb       NULL CHECK (addresses IS NULL OR jsonb_typeof(addresses) = 'object'),
  ADD COLUMN customer_refs        jsonb       NULL CHECK (customer_refs IS NULL OR jsonb_typeof(customer_refs) = 'object'),
  ADD COLUMN payment              jsonb       NULL CHECK (payment IS NULL OR jsonb_typeof(payment) = 'object'),
  ADD COLUMN terms                jsonb       NULL CHECK (terms IS NULL OR jsonb_typeof(terms) = 'object'),
  ADD COLUMN delivery             jsonb       NULL CHECK (delivery IS NULL OR jsonb_typeof(delivery) = 'object'),
  ADD COLUMN amounts              jsonb       NULL CHECK (amounts IS NULL OR jsonb_typeof(amounts) = 'object'),
  ADD COLUMN commerce_sequence    bigint      NULL CHECK (commerce_sequence IS NULL OR commerce_sequence >= 1),
  ADD COLUMN extras_fingerprint   char(64)    NULL CHECK (extras_fingerprint IS NULL OR extras_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD COLUMN coordinates_erased_at timestamptz NULL,
  ADD COLUMN acked_at             timestamptz NULL,
  ADD COLUMN set_aside_at         timestamptz NULL;

-- Ce que la ligne affiche et chiffre : nom du produit tel que vu par le client, lot « X achetés + Y offerts », montants HT et TVA de la ligne (NULL pour une ligne « prix sur devis »).
ALTER TABLE site_quote_line
  ADD COLUMN item_label    text  NULL CHECK (item_label IS NULL OR char_length(item_label) BETWEEN 1 AND 200),
  ADD COLUMN lot           jsonb NULL CHECK (lot IS NULL OR jsonb_typeof(lot) = 'object'),
  ADD COLUMN line_total_ht text  NULL CHECK (line_total_ht IS NULL OR line_total_ht ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$'),
  ADD COLUMN line_tva      text  NULL CHECK (line_tva IS NULL OR line_tva ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$');
ALTER TABLE site_order_line
  ADD COLUMN item_label    text  NULL CHECK (item_label IS NULL OR char_length(item_label) BETWEEN 1 AND 200),
  ADD COLUMN lot           jsonb NULL CHECK (lot IS NULL OR jsonb_typeof(lot) = 'object'),
  ADD COLUMN line_tva      text  NULL CHECK (line_tva IS NULL OR line_tva ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$');

-- La demande libre « Nous écrire » et « Une question sur ce produit » (ligne 5.10) : même canal que les devis.
CREATE TABLE site_message (
  id                   bigserial   PRIMARY KEY,
  message_ref          text        NOT NULL UNIQUE CHECK (message_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  idempotency_key      text        NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_fingerprint  char(64)    NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  number               text        NOT NULL UNIQUE CHECK (number ~ '^MSG-[0-9]{4}-[0-9]{6}$'),
  contact              jsonb       NOT NULL CHECK (jsonb_typeof(contact) = 'object'),
  message              text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  product              jsonb       NULL CHECK (product IS NULL OR jsonb_typeof(product) = 'object'),
  privacy_notice       text        NOT NULL CHECK (char_length(privacy_notice) BETWEEN 1 AND 40),
  status               text        NOT NULL CHECK (status = 'RECEIVED'),
  access_token_sha256  char(64)    NOT NULL CHECK (access_token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at_utc       text        NOT NULL CHECK (created_at_utc ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  coordinates_erased_at timestamptz NULL,
  acked_at             timestamptz NULL,
  set_aside_at         timestamptz NULL
);
CREATE TRIGGER site_message_immutable BEFORE UPDATE OR DELETE ON site_message
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_message_no_truncate BEFORE TRUNCATE ON site_message
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();
COMMENT ON TABLE site_message IS 'Cercle 5 - demande libre (formulaire « Nous écrire », question sur un produit) ; contact et message = données personnelles, effaçables par la migration suivante';

-- Le registre d'idempotence couvre aussi la demande libre.
ALTER TABLE site_idempotency DROP CONSTRAINT site_idempotency_kind_check;
ALTER TABLE site_idempotency ADD CONSTRAINT site_idempotency_kind_check CHECK (kind IN ('quote_request', 'order', 'message'));

-- L'outbox porte le troisième type d'événement.
ALTER TABLE site_outbox_event DROP CONSTRAINT site_outbox_event_event_type_check;
ALTER TABLE site_outbox_event ADD CONSTRAINT site_outbox_event_event_type_check CHECK (event_type IN ('quote.requested', 'order.received', 'message.received'));
ALTER TABLE site_outbox_event ADD COLUMN contract_version text NOT NULL DEFAULT 'site_events.v1' CHECK (contract_version IN ('site_events.v1', 'site_events.v2'));

-- Le journal sans donnée personnelle compte aussi les demandes libres.
ALTER TABLE site_transaction_log DROP CONSTRAINT site_transaction_log_operation_check;
ALTER TABLE site_transaction_log ADD CONSTRAINT site_transaction_log_operation_check CHECK (operation IN ('QUOTE', 'ORDER', 'MESSAGE', 'RECEIPT', 'EVENTS_POLL', 'EVENTS_ACK'));
