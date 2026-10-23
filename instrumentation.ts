/**
 * Contrôle de configuration au démarrage du serveur (revue A2, F-05) : avertit si `SITE_NOW_UTC`
 * est ignoré en production et signale une configuration d'horloge invalide (les requêtes
 * répondront alors 503 `CONFIG_INVALID`).
 * DF-0090 : `SITE_WITHDRAWAL_HOLD_POLICY.max_withdrawals_without_release = null` hors `SITE_ENV=staging`
 * refuse le démarrage (processus arrêté, code 1, message `DÉMARRAGE REFUSÉ`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { enforceStartupPolicy } = await import("@/lib/site-publish/config");
  if (!enforceStartupPolicy()) return;
  const { clockConfig, ConfigInvalid } = await import("@/lib/site-catalog/clock");
  try {
    const c = clockConfig();
    if (c.ignoredInProduction) {
      console.warn("[site-clock] AVERTISSEMENT : SITE_NOW_UTC est défini mais IGNORÉ (SITE_ENV=production) — horloge serveur utilisée");
    } else if (c.forced !== null) {
      console.warn(`[site-clock] instant figé par SITE_NOW_UTC=${c.forced} (SITE_ENV=${process.env.SITE_ENV ?? "absent"})`);
    }
  } catch (error) {
    if (error instanceof ConfigInvalid) console.error(`[site-clock] CONFIGURATION INVALIDE : ${error.reason} — ${error.message}`);
    else throw error;
  }
}
