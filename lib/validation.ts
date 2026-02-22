/**
 * Input validation and sanitization helpers.
 * Apply these on ALL data coming from clients before DB access or emails.
 */

export function sanitizeString(s: unknown, maxLen = 500): string {
  if (typeof s !== 'string') return '';
  return s
    .trim()
    .slice(0, maxLen)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '');
}

export function sanitizeEmail(s: unknown): string | null {
  const email = sanitizeString(s, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function sanitizeNumber(s: unknown, min = 0, max = 999999): number {
  const n = Number(s);
  if (isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

export function sanitizeHandle(s: unknown, maxLen = 200): string {
  return sanitizeString(s, maxLen).replace(/[^a-z0-9-]/g, '');
}
