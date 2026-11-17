/**
 * Cercle 3 (3.3, 3.4) — ce que le SITE sait d'une image d'un catalogue v2 : ses versions réduites (WebP, largeurs croissantes), son texte
 * alternatif et son nom lisible. Fonctions pures, sans dépendance : testées en direct par `tests/nav/media-view.test.mjs`.
 *
 * L'empreinte (`sha256`) d'une image est son identité : c'est elle que nomment les familles, les variantes et les rubriques. Quand l'image a des
 * versions réduites, ce sont celles-ci que le SITE sert, chacune sous sa propre empreinte ; l'original reste dans la Factory.
 */
export type Derivative = { sha256: string; width: number; height: number; mime: string; size: number };
export type MediaView = { alt: string | null; publicName: string | null; derivatives: Derivative[] };

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

/** `identité de l'image → sa vue`, pour les seules images qui ont des versions réduites (catalogue v2). Un catalogue v1 donne une table vide. */
export function mediaViews(doc: unknown): Map<string, MediaView> {
  const views = new Map<string, MediaView>();
  if (!isObj(doc) || doc["contract_version"] !== "site_snapshot.v2") return views;
  for (const media of Array.isArray(doc["media_refs"]) ? doc["media_refs"] : []) {
    if (!isObj(media) || typeof media["sha256"] !== "string" || !Array.isArray(media["derivatives"]) || media["derivatives"].length === 0) continue;
    const derivatives = media["derivatives"].filter(isObj).map((d) => ({ sha256: String(d["sha256"]), width: Number(d["width"]), height: Number(d["height"]), mime: String(d["mime"]), size: Number(d["size"]) }));
    derivatives.sort((a, b) => a.width - b.width);
    views.set(media["sha256"], {
      alt: typeof media["alt"] === "string" ? media["alt"] : null,
      publicName: typeof media["public_name"] === "string" ? media["public_name"] : null,
      derivatives,
    });
  }
  return views;
}

/** La plus petite version d'au moins `width` px de large ; à défaut (ou sans largeur demandée), la plus grande. Jamais d'agrandissement. */
export function pickDerivative(derivatives: readonly Derivative[], width?: number | null): Derivative | null {
  if (derivatives.length === 0) return null;
  const sorted = [...derivatives].sort((a, b) => a.width - b.width);
  if (width === undefined || width === null || !Number.isFinite(width)) return sorted[sorted.length - 1] ?? null;
  return sorted.find((d) => d.width >= width) ?? sorted[sorted.length - 1] ?? null;
}

/** Adresse d'un média : `/media/<empreinte>/<nom-lisible>.webp` ; le nom ne sert qu'à lire l'adresse, l'empreinte seule fait foi (I14). */
export function mediaPath(sha256: string, name?: string | null): string {
  return name && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ? `/media/${sha256}/${name}.webp` : `/media/${sha256}`;
}

/** La valeur de l'attribut `srcset` : une adresse par version réduite, avec sa largeur. */
export function srcSet(view: MediaView): string {
  return view.derivatives.map((d) => `${mediaPath(d.sha256, view.publicName)} ${d.width}w`).join(", ");
}

/** Le nom lisible d'une adresse `/media/<empreinte>/<nom>.webp` est libre : tout nom de la forme d'une adresse sert la même image. */
export function readableNameOk(segment: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/.test(segment) && segment.length <= 130;
}
