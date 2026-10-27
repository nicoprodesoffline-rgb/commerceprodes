-- BC2 (review F-02) : les octets reçus d'une génération et son identité sont immuables ; un ACK posé ne change plus.
-- Seuls statut, résultats, horodatages et la POSE initiale de l'ACK (NULL -> valeur) restent modifiables.
CREATE FUNCTION site_generation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot_bytes IS DISTINCT FROM OLD.snapshot_bytes
     OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
     OR NEW.catalogue_sequence IS DISTINCT FROM OLD.catalogue_sequence
     OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
     OR NEW.projection_id IS DISTINCT FROM OLD.projection_id
     OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
     OR NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json
     OR NEW.transport_json IS DISTINCT FROM OLD.transport_json THEN
    RAISE EXCEPTION 'site_generation: octets et identité d''une génération immuables (id=%)', OLD.id;
  END IF;
  IF OLD.ack_bytes IS NOT NULL
     AND (NEW.ack_bytes IS DISTINCT FROM OLD.ack_bytes OR NEW.ack_json IS DISTINCT FROM OLD.ack_json) THEN
    RAISE EXCEPTION 'site_generation: ACK déjà posé, immuable (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_generation_immutable BEFORE UPDATE ON site_generation
  FOR EACH ROW EXECUTE FUNCTION site_generation_immutable();
COMMENT ON FUNCTION site_generation_immutable() IS 'BC2 F-02 - snapshot_bytes, payload_sha256, identité et ACK posé immuables';
