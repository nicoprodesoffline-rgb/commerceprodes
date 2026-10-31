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

/** Le proxy fournit la première adresse ; espace, casse et valeurs non utilisables sont normalisés. */
export function requestKey(forwardedFor: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.length <= 128 && /^[0-9a-f:.]+$/.test(first) ? first : "local";
}
