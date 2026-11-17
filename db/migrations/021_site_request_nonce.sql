-- Cercle 4, lot T (4.4, DF-0115) : anti-rejeu daté des requêtes de la Factory (docs/contracts/c0_transport_v1.md §3).
-- Un nonce déjà vu pour une clé -> 401 REQUEST_REPLAYED. Les nonces sont en base pour survivre à un redémarrage ; ils sont
-- gardés au moins une heure (la fenêtre d'acceptation est de 300 s) puis supprimés au passage par le contrôle lui-même.
CREATE TABLE site_request_nonce (
  credential_key_id text        NOT NULL CHECK (credential_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  nonce             char(32)    NOT NULL CHECK (nonce ~ '^[0-9a-f]{32}$'),
  issued_at         timestamptz NOT NULL,
  seen_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_key_id, nonce)
);
CREATE INDEX site_request_nonce_issued ON site_request_nonce (issued_at);
