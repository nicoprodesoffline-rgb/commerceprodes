-- BC4 : commandes et lignes figées (C0 §10.3). Montants : chaîne Money (échelle 2) + centimes bigint cohérents.
-- Aucune colonne taxe, port, statut client ou paiement. Ni facturé, ni payé, ni livré.
CREATE TABLE site_order (
  id                  bigserial   PRIMARY KEY,
  order_ref           text        NOT NULL UNIQUE CHECK (order_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  idempotency_key     text        NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_fingerprint char(64)    NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  catalogue_sequence  bigint      NOT NULL CHECK (catalogue_sequence >= 1),
  contact             jsonb       NOT NULL CHECK (jsonb_typeof(contact) = 'object'),
  currency            text        NOT NULL CHECK (currency = 'EUR'),
  total_amount        text        NOT NULL CHECK (total_amount ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$'),
  total_cents         bigint      NOT NULL CHECK (total_cents > 0),
  status              text        NOT NULL CHECK (status IN ('RECEIVED', 'PENDING_REVIEW')),
  access_token_sha256 char(64)    NOT NULL CHECK (access_token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at_utc      text        NOT NULL CHECK (created_at_utc ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (total_cents = replace(total_amount, '.', '')::bigint)
);

CREATE TABLE site_order_line (
  id                         bigserial PRIMARY KEY,
  order_id                   bigint    NOT NULL REFERENCES site_order (id),
  line_no                    integer   NOT NULL CHECK (line_no BETWEEN 1 AND 200),
  public_item_key            text      NOT NULL CHECK (public_item_key ~ '^PI-[0-9A-HJKMNP-TV-Z]{9}$'),
  variant_axes               jsonb     NOT NULL CHECK (jsonb_typeof(variant_axes) = 'object'),
  quantity                   integer   NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  catalogue_sequence         bigint    NOT NULL CHECK (catalogue_sequence >= 1),
  rate_id                    text      NOT NULL CHECK (rate_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  unit_amount                text      NOT NULL CHECK (unit_amount ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$'),
  unit_cents                 bigint    NOT NULL CHECK (unit_cents > 0),
  currency                   text      NOT NULL CHECK (currency = 'EUR'),
  tax_basis_or_status        text      NOT NULL CHECK (tax_basis_or_status IN ('HT', 'UNQUALIFIED')),
  offer_price_version_public text      NOT NULL CHECK (offer_price_version_public ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  line_total                 text      NOT NULL CHECK (line_total ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$'),
  line_total_cents           bigint    NOT NULL CHECK (line_total_cents > 0),
  UNIQUE (order_id, line_no),
  UNIQUE (order_id, public_item_key, variant_axes),
  CHECK (unit_cents = replace(unit_amount, '.', '')::bigint),
  CHECK (line_total_cents = replace(line_total, '.', '')::bigint),
  CHECK (line_total_cents = unit_cents * quantity)
);
CREATE INDEX site_order_line_order ON site_order_line (order_id);

-- Au COMMIT : au moins une ligne, et total_cents = Σ line_total_cents (contrainte différée).
CREATE FUNCTION site_order_lines_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n   bigint;
  s   numeric;
  tot bigint;
BEGIN
  SELECT count(*), coalesce(sum(line_total_cents), 0) INTO n, s FROM site_order_line WHERE order_id = NEW.id;
  SELECT total_cents INTO tot FROM site_order WHERE id = NEW.id;
  IF n < 1 THEN
    RAISE EXCEPTION 'site_order % sans ligne', NEW.order_ref USING ERRCODE = '23514';
  END IF;
  IF s <> tot THEN
    RAISE EXCEPTION 'site_order % : total_cents % <> somme des lignes %', NEW.order_ref, tot, s USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER site_order_lines_consistent AFTER INSERT ON site_order
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION site_order_lines_consistent();

-- Seule évolution admise d'une commande : son statut (RECEIVED -> PENDING_REVIEW). Lignes immuables.
CREATE FUNCTION site_order_status_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_order est immuable (suppression refusée)';
  END IF;
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
     OR NOT (OLD.status = NEW.status OR (OLD.status = 'RECEIVED' AND NEW.status = 'PENDING_REVIEW')) THEN
    RAISE EXCEPTION 'site_order : seule la transition de statut RECEIVED -> PENDING_REVIEW est admise';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_order_status_only BEFORE UPDATE OR DELETE ON site_order
  FOR EACH ROW EXECUTE FUNCTION site_order_status_only();
CREATE TRIGGER site_order_line_immutable BEFORE UPDATE OR DELETE ON site_order_line
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_order_no_truncate BEFORE TRUNCATE ON site_order
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_order_line_no_truncate BEFORE TRUNCATE ON site_order_line
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_order IS 'BC4 - commande reçue (C0 §10.3), ni facturée ni payée ni livrée ; contact = PII, jamais dans l''outbox';
COMMENT ON TABLE site_order_line IS 'BC4 - lignes figées (prix, version, quantité) renvoyées par validateOrderSubmit';
