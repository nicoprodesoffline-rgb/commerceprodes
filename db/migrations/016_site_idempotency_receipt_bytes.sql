-- BC4 (review F-03) : octets canoniques EXACTS du reçu (canonicalBytes C0), renvoyés tels quels au rejeu et à la
-- consultation : le reçu d'un rejeu est identique octet pour octet à celui de la première réponse.
-- NOT NULL sans valeur par défaut : échoue fort si des lignes existent déjà (aucune donnée déployée en W1 ; jamais de
-- reconstruction silencieuse depuis receipt_json, dont jsonb ne conserve pas l'ordre des clés).
ALTER TABLE site_idempotency ADD COLUMN receipt_bytes bytea NOT NULL CHECK (octet_length(receipt_bytes) BETWEEN 2 AND 262144);
COMMENT ON COLUMN site_idempotency.receipt_bytes IS 'BC4 - canonicalBytes(reçu) : octets renvoyés au rejeu et à la consultation';
