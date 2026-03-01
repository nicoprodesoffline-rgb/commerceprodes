/**
 * PRODES Admin — Audit log helper
 *
 * Writes to admin_audit_log table (migration 012).
 * Gracefully degrades if table does not exist yet.
 */

import { supabaseServer } from "lib/supabase/client";
import type { AdminRole } from "./rbac";

export interface AuditEntry {
  actor?: string;
  role?: AdminRole | string;
  action: string;           // e.g. "product.update", "devis.bulk_status", "product.rollback"
  entity?: string;          // e.g. "product", "devis_request"
  entity_id?: string;
  payload_summary?: string; // short human-readable (no secrets, no PII beyond IDs)
  success?: boolean;
}

/**
 * Log an admin action to admin_audit_log.
 * Non-blocking: errors are swallowed to never break the main request flow.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    const client = supabaseServer();
    await client.from("admin_audit_log").insert({
      actor: entry.actor ?? "admin",
      role: entry.role ?? "superadmin",
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entity_id ?? null,
      payload_summary: entry.payload_summary ?? null,
      success: entry.success ?? true,
    });
  } catch {
    // Non-critical: never throw from audit log
    console.warn("[audit-log] Failed to write audit entry:", entry.action);
  }
}
