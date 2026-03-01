/**
 * PRODES Admin — RBAC v1
 *
 * Role hierarchy: viewer < editor < superadmin
 *
 * Source of truth (v1): ADMIN_ROLE env var (default: superadmin).
 * Future: read from admin_session JWT payload or DB.
 *
 * Usage:
 *   const role = getAdminRole(req);
 *   requireRole(role, "editor"); // throws 403 response if insufficient
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export type AdminRole = "viewer" | "editor" | "superadmin";

const ROLE_LEVELS: Record<AdminRole, number> = {
  viewer: 1,
  editor: 2,
  superadmin: 3,
};

/** Returns the role of the current admin request. Deny-by-default: returns null if unauthenticated. */
export function getAdminRole(req: NextRequest): AdminRole | null {
  // Check Bearer token
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  let authenticated = false;
  if (token && expected) {
    try {
      if (token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        authenticated = true;
      }
    } catch {
      // ignore
    }
  }

  // Check admin_session cookie (web UI)
  if (!authenticated) {
    const session = req.cookies.get("admin_session")?.value;
    if (session) authenticated = true;
  }

  if (!authenticated) return null;

  // Determine role from env (v1: all authenticated admins share one role)
  const envRole = (process.env.ADMIN_ROLE ?? "superadmin").toLowerCase() as AdminRole;
  return ROLE_LEVELS[envRole] !== undefined ? envRole : "superadmin";
}

/**
 * Returns a 401/403 response if the role is insufficient, or null if OK.
 * Usage: const denied = checkRoleGuard(role, "editor"); if (denied) return denied;
 */
export function checkRoleGuard(
  role: AdminRole | null,
  required: AdminRole,
): NextResponse | null {
  if (role === null) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (ROLE_LEVELS[role] < ROLE_LEVELS[required]) {
    return NextResponse.json(
      { error: `Rôle insuffisant. Requis: ${required}, actuel: ${role}` },
      { status: 403 },
    );
  }
  return null;
}

/** Convenience: get role and immediately guard. Returns { role } or { denied: NextResponse }. */
export function guardRole(
  req: NextRequest,
  required: AdminRole,
): { role: AdminRole; denied: null } | { role: null; denied: NextResponse } {
  const role = getAdminRole(req);
  const denied = checkRoleGuard(role, required);
  if (denied) return { role: null, denied };
  return { role: role!, denied: null };
}
