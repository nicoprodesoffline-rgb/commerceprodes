-- CA-9 : agrégats quotidiens uniquement. Propriétaire : rôle qui applique les migrations SITE (prodes_site).
CREATE TABLE IF NOT EXISTS site_product_metrics_daily (
  day             date    NOT NULL,
  public_item_key  text    NOT NULL,
  views           integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  add_to_cart     integer NOT NULL DEFAULT 0 CHECK (add_to_cart >= 0),
  quote_start     integer NOT NULL DEFAULT 0 CHECK (quote_start >= 0),
  quote_submit    integer NOT NULL DEFAULT 0 CHECK (quote_submit >= 0),
  PRIMARY KEY (day, public_item_key)
);
COMMENT ON TABLE site_product_metrics_daily IS 'CA-9 - compteurs par jour de Paris et produit ; aucun événement brut ni identifiant visiteur';
