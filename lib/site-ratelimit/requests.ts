/**
 * Cercle 5, ligne 5.23 : limite de débit par adresse sur les envois de devis, de commande et de demande libre (docs/site_events_v2.md §6, attendu P04) :
 * le sixième envoi en une minute depuis une même adresse reçoit « trop de demandes, réessayez dans une minute » (429, `retry-after`).
 * Un seul seau pour les trois envois (une personne qui demande un devis puis commande reste très en dessous) ; le reçu a son propre seau (même fonction, autre `group`).
 * L'adresse vient du frontal (`clientAddress`), jamais de l'en-tête du visiteur. L'état vit sur `globalThis` : le proxy et les routes sont empaquetés séparément.
 */
import { clientAddress, createLimiter, type AddressEnv } from "./limiter";

export const REQUEST_LIMIT_DEFAULT = 5;
export const REQUEST_WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
export const TOO_MANY = "Trop de demandes, réessayez dans une minute.";

type Limiter = ReturnType<typeof createLimiter>;
const KEY = Symbol.for("prodes.site.request-limiters");
type Holder = typeof globalThis & { [KEY]?: Map<string, { limit: number; limiter: Limiter }> };

function limiterFor(group: string, env: Record<string, string | undefined>): Limiter {
  const holder = globalThis as Holder;
  const all = (holder[KEY] ??= new Map());
  const raw = env["SITE_REQUEST_LIMIT"];
  const limit = raw !== undefined && /^[1-9][0-9]{0,3}$/.test(raw.trim()) ? Number(raw.trim()) : REQUEST_LIMIT_DEFAULT;
  const known = all.get(group);
  if (known !== undefined && known.limit === limit) return known.limiter;
  const limiter = createLimiter({ limit, windowMs: REQUEST_WINDOW_MS, maxKeys: MAX_KEYS });
  all.set(group, { limit, limiter });
  return limiter;
}

/** `null` si l'envoi passe ; sinon la réponse 429. Chaque envoi admis compte, un envoi refusé ne rallonge pas l'attente. */
export function requestLimitRefusal(headers: { get(name: string): string | null }, group: "send" | "receipt" = "send", env: Record<string, string | undefined> = process.env, now: number = Date.now()): Response | null {
  const taken = limiterFor(group, env).take(clientAddress(headers, env as AddressEnv), now);
  if (taken.ok) return null;
  return new Response(JSON.stringify({ accepted: false, durable: false, outcome: "REJECTED", error_codes: ["RATE_LIMITED"], message: TOO_MANY, retry_after_seconds: taken.retryAfterSeconds, verdict: null }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(taken.retryAfterSeconds) },
  });
}

/** Remet les compteurs à zéro (tests). */
export function resetRequestLimits(): void {
  delete (globalThis as Holder)[KEY];
}
