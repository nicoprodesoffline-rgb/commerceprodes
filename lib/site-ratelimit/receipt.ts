/**
 * Cercle 5 (5.22, 5.23, attendu P04) : cinq consultations de reçu par minute et par adresse ; la sixième reçoit 429 (`TOO_MANY_REQUESTS`, comportement public inchangé).
 * Le plafond se règle par `SITE_RECEIPT_LIMIT` (entier ≥ 1) ; SANS variable, il reste 5. Les essais de bout en bout, qui consultent bien plus de cinq reçus par minute, le relèvent.
 * L'état vit sur `globalThis` (le proxy et les routes sont empaquetés séparément) ; l'adresse vient du frontal (`clientAddress`), jamais de l'en-tête du visiteur.
 */
import { clientAddress, createLimiter, type AddressEnv } from "./limiter";

export const RECEIPT_LIMIT_DEFAULT = 5;
const KEY = Symbol.for("prodes.site.receipt-limiter");
type Holder = typeof globalThis & { [KEY]?: { limit: number; limiter: ReturnType<typeof createLimiter> } };

function limiterFor(env: Record<string, string | undefined>) {
  const raw = env["SITE_RECEIPT_LIMIT"];
  const limit = raw !== undefined && /^[1-9][0-9]{0,5}$/.test(raw.trim()) ? Number(raw.trim()) : RECEIPT_LIMIT_DEFAULT;
  const holder = globalThis as Holder;
  if (holder[KEY]?.limit !== limit) holder[KEY] = { limit, limiter: createLimiter({ limit, windowMs: 60_000, maxKeys: 10_000 }) };
  return holder[KEY]!.limiter;
}

/** `null` si la consultation passe ; sinon la réponse 429. */
export function receiptLimitRefusal(headers: { get(name: string): string | null }, env: Record<string, string | undefined> = process.env, now: number = Date.now()): Response | null {
  const taken = limiterFor(env).take(clientAddress(headers, env as AddressEnv), now);
  if (taken.ok) return null;
  return new Response(JSON.stringify({ accepted: false, outcome: "REJECTED", error_codes: ["TOO_MANY_REQUESTS"], message: "Trop de demandes, réessayez dans une minute." }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(taken.retryAfterSeconds) },
  });
}

/** Remet les compteurs à zéro (tests). */
export function resetReceiptLimit(): void {
  delete (globalThis as Holder)[KEY];
}
