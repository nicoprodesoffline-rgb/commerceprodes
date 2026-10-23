-- BC2 : médias publics adressés par contenu (C0 §8.5). La clé EST le SHA-256 des octets.
CREATE TABLE site_media (
  sha256      char(64)    PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime        text,
  size        integer     NOT NULL CHECK (size BETWEEN 1 AND 20971520),
  bytes       bytea       NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_media_size_matches CHECK (size = octet_length(bytes))
);
COMMENT ON TABLE site_media IS 'BC2 - médias content-addressed ; mime = indication de transport, jamais utilisé pour décider (le mime déclaré par media_refs fait foi)';
