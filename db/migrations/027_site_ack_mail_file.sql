-- B-3 : mode « fichier » de l'accusé. Le message est écrit dans un fichier d'essai (.eml) et rien ne sort ; l'état se lit « écrit dans le fichier d'essai ».
-- Deux colonnes : l'échéance d'attente du PDF déposé par la Factory, et l'expéditeur de la boutique (coordonnées du document site_commerce au moment de la demande).
ALTER TABLE site_ack_mail ADD COLUMN IF NOT EXISTS pdf_wait_until timestamptz NULL;
ALTER TABLE site_ack_mail ADD COLUMN IF NOT EXISTS sender jsonb NULL;
ALTER TABLE site_ack_mail DROP CONSTRAINT IF EXISTS site_ack_mail_mode_check;
ALTER TABLE site_ack_mail ADD CONSTRAINT site_ack_mail_mode_check CHECK (mode IN ('garde', 'fichier', 'smtp'));
ALTER TABLE site_ack_mail DROP CONSTRAINT IF EXISTS site_ack_mail_state_check;
ALTER TABLE site_ack_mail ADD CONSTRAINT site_ack_mail_state_check CHECK (state IN ('garde', 'a_envoyer', 'ecrit_fichier', 'envoye', 'refuse', 'sans_reponse'));
ALTER TABLE site_ack_mail DROP CONSTRAINT IF EXISTS site_ack_mail_file_wait;
ALTER TABLE site_ack_mail ADD CONSTRAINT site_ack_mail_file_wait CHECK (mode = 'fichier' OR pdf_wait_until IS NULL);
CREATE INDEX IF NOT EXISTS site_ack_mail_file_due ON site_ack_mail (next_attempt_at) WHERE mode = 'fichier' AND state = 'a_envoyer';

-- Un accusé écrit dans le fichier est final, comme un accusé envoyé.
CREATE OR REPLACE FUNCTION site_ack_mail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF OLD.state IN ('envoye', 'ecrit_fichier', 'refuse', 'sans_reponse', 'garde') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'site_ack_mail : % est final', OLD.state;
  END IF;
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'site_ack_mail : attempts décroissant';
  END IF;
  RETURN NEW;
END $$;
