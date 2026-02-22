/**
 * Simple in-memory rate limiter.
 * Sufficient for low-volume B2B traffic.
 * Resets automatically per window.
 */

const rateLimitStore = new Map<string, { count: number; reset: number }>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param ip     - Client IP (use x-forwarded-for header)
 * @param limit  - Max requests per window
 * @param windowMs - Window duration in ms
 */
export function rateLimit(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.reset) {
    rateLimitStore.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
