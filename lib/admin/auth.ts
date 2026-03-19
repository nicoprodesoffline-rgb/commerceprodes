import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Shared admin authentication helper.
 * Checks the Authorization: Bearer <token> header against ADMIN_PASSWORD.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function checkAdminAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(token.padEnd(expected.length));
    const b = Buffer.from(expected.padEnd(token.length));
    // Use fixed-length buffers of the same size
    const len = Math.max(a.length, b.length);
    const ba = Buffer.alloc(len);
    const bb = Buffer.alloc(len);
    a.copy(ba);
    b.copy(bb);
    return timingSafeEqual(ba, bb) && token.length === expected.length;
  } catch {
    return token === expected;
  }
}
