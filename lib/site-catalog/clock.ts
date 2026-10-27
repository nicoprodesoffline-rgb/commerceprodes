/**
 * Instant serveur au format C0 (§6 : `YYYY-MM-DDTHH:MM:SSZ`, UTC, sans fraction).
 *
 * `SITE_NOW_UTC` (remplace `SPIKE_NOW_UTC`) fige l'instant pour les tests et les démonstrations
 * sur fixtures. Garde d'environnement (revue A2, F-05) :
 *   - `SITE_ENV` absent ou `staging` : `SITE_NOW_UTC` est honoré ; valeur non C0 → `ConfigInvalid` ;
 *   - `SITE_ENV=production` : `SITE_NOW_UTC` est IGNORÉ (avertissement au démarrage, voir
 *     `instrumentation.ts`) — l'horloge serveur fait foi (C0 §8.4, §10.3) ;
 *   - toute autre valeur de `SITE_ENV` → `ConfigInvalid`.
 * Jamais une valeur venant du client.
 */
import { isUtc } from "@/c0/ts/src/formats";

/** Configuration serveur invalide : l'API répond 503 `CONFIG_INVALID`, jamais un 500 vide. */
export class ConfigInvalid extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigInvalid";
  }
}

type ClockConfig = { forced: string | null; ignoredInProduction: boolean };

export function clockConfig(): ClockConfig {
  const env = process.env.SITE_ENV ?? "";
  if (env !== "" && env !== "staging" && env !== "production") {
    throw new ConfigInvalid("SITE_ENV_INVALID", `SITE_ENV doit valoir « staging » ou « production » (reçu : ${JSON.stringify(env)})`);
  }
  const forced = process.env.SITE_NOW_UTC ?? "";
  if (forced === "") return { forced: null, ignoredInProduction: false };
  if (env === "production") return { forced: null, ignoredInProduction: true };
  if (!isUtc(forced)) {
    throw new ConfigInvalid("SITE_NOW_UTC_INVALID", `SITE_NOW_UTC invalide (format C0 YYYY-MM-DDTHH:MM:SSZ attendu) : ${JSON.stringify(forced)}`);
  }
  return { forced, ignoredInProduction: false };
}

export function serverNowUtc(): string {
  return clockConfig().forced ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Vrai si l'instant est figé par SITE_NOW_UTC (affiché dans le bandeau). */
export function isForcedNow(): boolean {
  return clockConfig().forced !== null;
}
