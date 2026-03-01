/**
 * lib/admin/auth.ts
 * Source unique de vérité pour l'authentification admin.
 * Accepte :
 *   1. Cookie `admin_session` (set par /api/admin/auth — préféré)
 *   2. Header `Authorization: Bearer <ADMIN_PASSWORD>` (legacy/scripts)
 *
 * Utilisation dans les routes API:
 *   import { checkAdminAuth } from "lib/admin/auth";
 *   if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
 */

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function checkAdminAuth(req: NextRequest): boolean {
  // 1. Cookie session (priorité — set lors du login admin)
  const session = req.cookies.get("admin_session")?.value;
  if (session) return true;

  // 2. Bearer token (legacy, CI scripts, MCP)
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (token && expected && token.length === expected.length) {
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  return false;
}
