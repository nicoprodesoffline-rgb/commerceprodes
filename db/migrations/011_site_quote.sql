-- BC4 : demandes de devis et lignes figées (C0 §10.2). Aucune colonne taxe, port, statut client ou paiement.
-- Les lignes sont celles RENVOYÉES par validateQuoteRequest (jamais le corps client).
CREATE TABLE site_quote_request (
  id                  bigserial   PRIMARY KEY,
  quote_ref           text        NOT NULL UNIQUE CHECK (quote_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  idempotency_key     text        NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_fingerprint char(64)    NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  catalogue_sequence  bigint      NULL CHECK (catalogue_sequence >= 1),
  contact             jsonb       NOT NULL CHECK (jsonb_typeof(contact) = 'object'),
  message             text        NULL,
  status              text        NOT NULL CHECK (status = 'RECEIVED'),
  access_token_sha256 char(64)    NOT NULL CHECK (access_token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at_utc      text        NOT NULL CHECK (created_at_utc ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_quote_line (
  id                         bigserial PRIMARY KEY,
  quote_id                   bigint    NOT NULL REFERENCES site_quote_request (id),
  line_no                    integer   NOT NULL CHECK (line_no BETWEEN 1 AND 200),
  public_item_key            text      NOT NULL CHECK (public_item_key ~ '^PI-[0-9A-HJKMNP-TV-Z]{9}$'),
  variant_axes               jsonb     NOT NULL CHECK (jsonb_typeof(variant_axes) = 'object'),
  quantity                   integer   NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  priced                     boolean   NOT NULL,
  catalogue_sequence         bigint    NULL CHECK (catalogue_sequence >= 1),
  rate_id                    text      NULL CHECK (rate_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  unit_amount                text      NULL CHECK (unit_amount ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$' AND unit_amount <> '0.00'),
  currency                   text      NULL CHECK (currency = 'EUR'),
  tax_basis_or_status        text      NULL CHECK (tax_basis_or_status IN ('HT', 'UNQUALIFIED')),
  offer_price_version_public text      NULL CHECK (offer_price_version_public ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  UNIQUE (quote_id, line_no),
  UNIQUE (quote_id, public_item_key, variant_axes),
  -- Une ligne chiffrée porte tout son prix ; une ligne non chiffrée n'en porte AUCUN (jamais un ancien montant reconduit).
  CHECK (
    (priced AND catalogue_sequence IS NOT NULL AND rate_id IS NOT NULL AND unit_amount IS NOT NULL
            AND currency IS NOT NULL AND tax_basis_or_status IS NOT NULL AND offer_price_version_public IS NOT NULL)
    OR
    (NOT priced AND catalogue_sequence IS NULL AND rate_id IS NULL AND unit_amount IS NULL
            AND currency IS NULL AND tax_basis_or_status IS NULL AND offer_price_version_public IS NULL)
  )
);
CREATE INDEX site_quote_line_quote ON site_quote_line (quote_id);

-- Aucun devis sans ligne : vérifié au COMMIT (contrainte différée).
CREATE FUNCTION site_quote_has_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM site_quote_line WHERE quote_id = NEW.id) THEN
    RAISE EXCEPTION 'site_quote_request % sans ligne', NEW.quote_ref USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER site_quote_request_has_lines AFTER INSERT ON site_quote_request
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION site_quote_has_lines();

-- Historique figé : ni modification ni suppression (devis et lignes).
CREATE TRIGGER site_quote_request_immutable BEFORE UPDATE OR DELETE ON site_quote_request
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_quote_line_immutable BEFORE UPDATE OR DELETE ON site_quote_line
  FOR EACH ROW EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_quote_request_no_truncate BEFORE TRUNCATE ON site_quote_request
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();
CREATE TRIGGER site_quote_line_no_truncate BEFORE TRUNCATE ON site_quote_line
  FOR EACH STATEMENT EXECUTE FUNCTION site_bc4_immutable();

COMMENT ON TABLE site_quote_request IS 'BC4 - demande de devis reçue (C0 §10.2), contact = PII, jamais dans l''outbox';
COMMENT ON TABLE site_quote_line IS 'BC4 - lignes figées renvoyées par validateQuoteRequest';
