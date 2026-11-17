/**
 * Cercle 4, 4.11 — cache mémoire borné des médias, indexé par l'empreinte. Une adresse à empreinte ne change jamais de contenu : rien à invalider.
 * Plafond : SITE_MEDIA_CACHE_MB (256 par défaut ; 0 = pas de cache). Un média plus gros que le plafond n'est pas gardé. Éviction : le moins récemment demandé.
 * État sur `globalThis` (le proxy et les routes sont empaquetés séparément).
 */
export interface CachedMedia {
  bytes: Uint8Array;
  mime: string;
}

const KEY = Symbol.for("prodes.site.media-cache");
type Store = { entries: Map<string, CachedMedia>; bytes: number };
type Holder = typeof globalThis & { [KEY]?: Store };

function store(): Store {
  const g = globalThis as Holder;
  return (g[KEY] ??= { entries: new Map(), bytes: 0 });
}

export function mediaCacheLimitBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = env["SITE_MEDIA_CACHE_MB"];
  if (raw === undefined || raw.trim() === "") return 256 * 1024 * 1024;
  return /^[0-9]{1,6}$/.test(raw.trim()) ? Number(raw.trim()) * 1024 * 1024 : 256 * 1024 * 1024;
}

export function cachedMedia(sha256: string): CachedMedia | null {
  const s = store();
  const hit = s.entries.get(sha256);
  if (hit === undefined) return null;
  s.entries.delete(sha256);
  s.entries.set(sha256, hit);
  return hit;
}

export function rememberMedia(sha256: string, media: CachedMedia, limit: number = mediaCacheLimitBytes()): void {
  const s = store();
  if (limit <= 0 || media.bytes.length > limit || s.entries.has(sha256)) return;
  s.entries.set(sha256, media);
  s.bytes += media.bytes.length;
  for (const [key, entry] of s.entries) {
    if (s.bytes <= limit) break;
    s.entries.delete(key);
    s.bytes -= entry.bytes.length;
  }
}

export function mediaCacheStats(): { entries: number; bytes: number } {
  const s = store();
  return { entries: s.entries.size, bytes: s.bytes };
}

export function resetMediaCache(): void {
  const g = globalThis as Holder;
  delete g[KEY];
}
