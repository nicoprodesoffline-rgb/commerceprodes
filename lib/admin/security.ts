/**
 * Security helpers for admin routes.
 * - safeError: sanitize error messages before sending to client
 * - adminRateLimit: lightweight in-memory rate limiter for admin routes
 */

// ── Safe error responses ─────────────────────────────────────────────────────

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  "Non autorisé": "Non autorisé",
  "JSON invalide": "Corps de requête invalide",
  "Not found": "Ressource introuvable",
};

/**
 * Returns a safe error message for the client.
 * In production: never expose internal details (Supabase errors, stack traces, etc.)
 * In development: returns the original message.
 */
export function safeErrorMessage(
  err: unknown,
  fallback = "Une erreur serveur s'est produite",
): string {
  if (process.env.NODE_ENV !== "production") {
    // In dev, return full error for debugging
    if (err instanceof Error) return err.message;
    return String(err ?? fallback);
  }

  // In production: only allow safe pre-approved messages
  if (err instanceof Error) {
    const msg = err.message;
    // Allow known safe messages
    if (SAFE_ERROR_MESSAGES[msg]) return SAFE_ERROR_MESSAGES[msg]!;
    // Detect and allow auth messages
    if (msg === "Non autorisé" || msg === "Unauthorized") return "Non autorisé";
    // Detect migration messages (safe to expose)
    if (
      msg.toLowerCase().includes("migration") ||
      msg.includes("MIGRATION_REQUIRED")
    )
      return msg;
  }

  return fallback;
}

// ── In-memory rate limiter ───────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

/**
 * Rate limit by IP address.
 * @returns true if the request is allowed, false if rate limited
 */
export function adminRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  maybeCleanup();
  const now = Date.now();
  const key = ip;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

/**
 * Extract IP from request headers (handles Vercel / Cloudflare proxies).
 */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get("x-forwarded-for") ?? "";
  const realIp = (req.headers as Headers).get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || realIp || "unknown";
}
