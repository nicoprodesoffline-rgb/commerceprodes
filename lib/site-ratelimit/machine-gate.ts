/**
 * Cercle 4, 4.10 (S3, S04, S05) — garde des routes que la Factory appelle (`/api/site/publish/**`, `/api/site/content/**`, `/api/site/events/**`), AVANT la porte de signature
 * et avant toute lecture de corps ni écriture de journal.
 *
 *   1. liste d'adresses autorisées (`SITE_MACHINE_ALLOWLIST`, adresses séparées par des virgules ; VIDE par défaut = tout le monde passe au contrôle suivant) : une adresse hors liste reçoit 403 ;
 *   2. limite de REFUS par adresse (`SITE_MACHINE_FAILURE_LIMIT`, 30 par minute) : chaque refus de `COUNTED_REFUSALS` (401, 413, 400) compte ; au seuil, l'adresse reçoit 429 jusqu'à la fin de la fenêtre
 *      (401 d'abord, puis 429, et plus aucune ligne de journal : la requête n'atteint pas le receveur) ;
 *
 * Une requête dont la signature est valide n'est jamais limitée (« tout republier » envoie des milliers d'images, à plus de 20 par seconde) : seuls les REFUS comptent. Un débordement
 * signé supposerait la clé, et le rejeu est refusé par l'anti-rejeu du transport.
 *
 * L'adresse vient du frontal (`clientAddress`), jamais de l'en-tête du visiteur. L'état vit sur `globalThis` : le proxy et les routes sont empaquetés séparément.
 */
import { clientAddress } from "./limiter";

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const KEY = Symbol.for("prodes.site.machine-gate");

interface State {
  failures: Map<string, number[]>;
}
type Holder = typeof globalThis & { [KEY]?: State };

function state(): State {
  const holder = globalThis as Holder;
  return (holder[KEY] ??= { failures: new Map() });
}

function positive(raw: string | undefined, fallback: number): number {
  return raw !== undefined && /^[0-9]{1,7}$/.test(raw.trim()) && Number(raw.trim()) >= 1 ? Number(raw.trim()) : fallback;
}

function refuse(status: number, code: string, retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (retryAfterSeconds !== undefined) headers["retry-after"] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ accepted: false, outcome: "TRANSPORT_ERROR", transport_error: code, error_codes: [] }), { status, headers });
}

type Env = Record<string, string | undefined>;

/** Le contrôle seul (testable) : `refusal` si la requête doit être refusée ici, `fail()` à appeler quand la réponse finale est un refus de signature. */
export function machineGuard(headers: { get(name: string): string | null }, env: Env = process.env, now: number = Date.now()): { refusal: Response | null; fail: () => void } {
  const s = state();
  const address = clientAddress(headers, env);
  const noop = { refusal: null as Response | null, fail: () => undefined };
  const allowed = (env["SITE_MACHINE_ALLOWLIST"] ?? "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => a !== "");
  if (allowed.length > 0 && !allowed.includes(address)) return { ...noop, refusal: refuse(403, "ADDRESS_NOT_ALLOWED") };

  const limit = positive(env["SITE_MACHINE_FAILURE_LIMIT"], 30);
  const recent = (s.failures.get(address) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length > 0) s.failures.set(address, recent);
  else s.failures.delete(address);
  if (recent.length >= limit) return { ...noop, refusal: refuse(429, "RATE_LIMITED", Math.max(1, Math.ceil((recent[0]! + WINDOW_MS - now) / 1000))) };

  return {
    refusal: null,
    fail: () => {
      if (!s.failures.has(address) && s.failures.size >= MAX_KEYS) s.failures.delete(s.failures.keys().next().value!);
      s.failures.set(address, [...(s.failures.get(address) ?? []), now]);
    },
  };
}

/**
 * Les réponses qui comptent comme un refus pour l'adresse : celles qu'un appelant SANS la clé peut obtenir, avec un identifiant de clé public et une signature factice, et que la Factory légitime
 * ne reçoit jamais dans un usage normal : 401 (signature, clé inconnue, requête non datée, périmée ou rejouée), 413 (corps trop gros, refusé avant toute vérification de signature) et 400
 * (corps, chemin ou requête mal formés). 404 ne compte PAS : « génération non déposée » (GENERATION_NOT_STAGED) est une réponse normale que la Factory sait lire (relevé d'une publication
 * qui n'a pas été déposée : projections/adapters/site_snapshot.py), elle ne doit jamais la bloquer. 409 et 422 viennent APRÈS la signature (séquence, contenu).
 */
export const COUNTED_REFUSALS: ReadonlySet<number> = new Set([400, 401, 413]);

/** Exécute `run` derrière la garde ; une réponse de `COUNTED_REFUSALS` compte comme un refus pour l'adresse. */
export async function guarded(headers: { get(name: string): string | null }, run: () => Promise<Response>): Promise<Response> {
  const guard = machineGuard(headers);
  if (guard.refusal !== null) return guard.refusal;
  const response = await run();
  if (COUNTED_REFUSALS.has(response.status)) guard.fail();
  return response;
}

/** Vide l'état (tests). */
export function resetMachineGuard(): void {
  const holder = globalThis as Holder;
  delete holder[KEY];
}
