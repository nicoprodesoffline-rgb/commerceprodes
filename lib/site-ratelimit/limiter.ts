/** Fenêtre glissante par processus : seuls les envois acceptés sont mémorisés. */
export function createLimiter({ limit, windowMs, maxKeys }: { limit: number; windowMs: number; maxKeys: number }) {
  for (const value of [limit, windowMs, maxKeys]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("Les limites doivent être des entiers strictement positifs.");
  }
  const keys = new Map<string, number[]>();
  return {
    take(key: string, now: number): { ok: boolean; retryAfterSeconds: number } {
      // Purger avant de borner, y compris les clés qui n'ont plus fait de demande.
      for (const [storedKey, times] of keys) {
        const active = times.filter((time) => time > now - windowMs);
        if (active.length === 0) keys.delete(storedKey);
        else keys.set(storedKey, active);
      }
      let times = keys.get(key);
      if (!times) {
        if (keys.size >= maxKeys) keys.delete(keys.keys().next().value!);
        times = [];
        keys.set(key, times);
      }
      if (times.length >= limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((times[0]! + windowMs - now) / 1000)) };
      times.push(now);
      return { ok: true, retryAfterSeconds: 0 };
    },
  };
}

const ADDRESS = /^[0-9a-f:.]{1,128}$/;

/** Où se lisent les réglages du frontal : un seul processus de SITE, un seul frontal devant (docs : README « Frontal »). */
export interface AddressEnv {
  SITE_TRUSTED_PROXY_HOPS?: string | undefined;
  SITE_CLIENT_ADDRESS_HEADER?: string | undefined;
}

/**
 * L'adresse du visiteur, telle que le frontal l'a posée. Cercle 4, 4.10 (S05) : jamais celle que le visiteur écrit lui-même.
 *
 * - `SITE_TRUSTED_PROXY_HOPS` = nombre de frontaux devant le site (0 ou absent : aucun, l'en-tête est ignoré, tous les appels partagent la clé « direct ») ;
 * - l'adresse retenue est la n-ième en partant de la DROITE de l'en-tête (`SITE_CLIENT_ADDRESS_HEADER`, `x-forwarded-for` par défaut) : chaque frontal ajoute à droite
 *   l'adresse de celui qui lui a parlé, les valeurs écrites par le visiteur restent à gauche ;
 * - valeur absente ou illisible : « inconnue » (jamais une valeur devinée).
 */
export function clientAddress(headers: { get(name: string): string | null }, env: AddressEnv = process.env as AddressEnv): string {
  const raw = env.SITE_TRUSTED_PROXY_HOPS;
  const hops = raw !== undefined && /^[0-9]{1,2}$/.test(raw.trim()) ? Number(raw.trim()) : 0;
  if (hops === 0) return "direct";
  const name = (env.SITE_CLIENT_ADDRESS_HEADER ?? "").trim().toLowerCase() || "x-forwarded-for";
  const list = (headers.get(name) ?? "").split(",").map((part) => part.trim().toLowerCase());
  const picked = list[list.length - hops];
  return picked !== undefined && ADDRESS.test(picked) ? picked : "inconnue";
}
