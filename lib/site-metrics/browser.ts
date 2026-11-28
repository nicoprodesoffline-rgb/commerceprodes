import type { BrowserMetric } from "./core";
/** Envoi opportuniste sans identité ; aucun échec ne modifie le parcours. */
export function emitMetric(key: string, event: BrowserMetric): void {
  if (!key) return;
  try {
    void fetch("/api/site/metrics/event", {
      method: "POST", body: JSON.stringify({ key, event }),
      headers: { "content-type": "application/json" }, keepalive: true,
      credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    }).catch(() => undefined);
  } catch { /* indisponible : silencieux */ }
}
