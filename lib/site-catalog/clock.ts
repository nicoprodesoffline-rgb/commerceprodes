/**
 * Instant serveur au format C0 (§6 : `YYYY-MM-DDTHH:MM:SSZ`, UTC, sans fraction).
 *
 * `SITE_NOW_UTC` (remplace `SPIKE_NOW_UTC`) fige l'instant pour les tests et les
 * démonstrations sur fixtures ; il doit être un instant C0 valide, sinon erreur explicite.
 * En son absence : horloge du serveur. Jamais une valeur venant du client.
 */
import { isUtc } from "@/c0/ts/src/formats";

export function serverNowUtc(): string {
  const forced = process.env.SITE_NOW_UTC;
  if (forced !== undefined && forced !== "") {
    if (!isUtc(forced)) throw new Error(`SITE_NOW_UTC invalide (format C0 YYYY-MM-DDTHH:MM:SSZ attendu) : ${forced}`);
    return forced;
  }
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Vrai si l'instant est figé par SITE_NOW_UTC (affiché dans le bandeau). */
export function isForcedNow(): boolean {
  return (process.env.SITE_NOW_UTC ?? "") !== "";
}
