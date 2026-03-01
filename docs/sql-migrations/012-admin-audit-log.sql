-- Migration 012 — Admin audit log
-- Run in: Supabase Dashboard > SQL Editor
-- Idempotent (safe to re-run)

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor           text NOT NULL DEFAULT 'admin',        -- who performed the action
  role            text NOT NULL DEFAULT 'superadmin',   -- RBAC role at time of action
  action          text NOT NULL,                        -- e.g. 'product.update', 'devis.bulk_status'
  entity          text,                                 -- e.g. 'product', 'devis_request'
  entity_id       text,                                 -- UUID or slug of affected entity
  payload_summary text,                                 -- short human-readable summary (no secrets)
  success         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action    ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity    ON admin_audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created   ON admin_audit_log(created_at DESC);
