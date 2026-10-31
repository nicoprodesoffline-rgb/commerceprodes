/**
 * Lecture de Familles publiées par adresse (slug) pour les favoris, le comparateur et les « récemment consultés » (API-33). Forme pure, testable sans serveur :
 * les slugs sont validés (jamais interprétés), dédoublonnés, bornés ; un slug inconnu n'est pas une erreur, il est rendu dans `missing` pour que le navigateur
 * purge sa mémoire. « Meilleur prix » = drapeau posé PAR LE SERVEUR sur le plus bas prix retenu (le navigateur ne compare aucun montant).
 */
import type { Family } from "./catalog";
import type { FamilyPrice } from "./listing";

/** Centimes entiers d'une chaîne Money C0 (même lecture que `listing.ts`, répétée ici pour que ce module reste importable sans résolution de chemin). */
const cents = (amount: string): bigint | null => {
  const m = /^(\d+)\.(\d{2})$/.exec(amount);
  return m ? BigInt(m[1]!) * 100n + BigInt(m[2]!) : null;
};

export const LOOKUP_MAX = 20;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export type LookedUp = {
  slug: string; name: string; description: string; category: string | null; imageSha: string | null;
  variantCount: number; reference: string | null; axes: string[]; priceText: string; best: boolean;
  single: { public_item_key: string; variant_axes: Record<string, string>; axes: { label: string; value: string }[] } | null;
};

export function parseSlugs(raw: string | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const slug = part.trim();
    if (SLUG_RE.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === LOOKUP_MAX) break;
  }
  return out;
}

export function lookUp(
  slugs: string[], familyBySlug: (slug: string) => Family | null | undefined, priceOf: (f: Family) => FamilyPrice,
  priceText: (p: FamilyPrice) => string, categoryOf: (f: Family) => string | null,
): { found: LookedUp[]; missing: string[] } {
  const rows: { family: Family; price: FamilyPrice }[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const family = familyBySlug(slug);
    if (family) rows.push({ family, price: priceOf(family) }); else missing.push(slug);
  }
  const priced = rows.map((r) => (r.price ? cents(r.price.amount) : null)).filter((c): c is bigint => c !== null);
  const lowest = priced.length >= 2 ? priced.reduce((a, b) => (b < a ? b : a)) : null;
  const found = rows.map(({ family, price }) => ({
    slug: family.slug, name: family.name, description: family.description_short, category: categoryOf(family),
    imageSha: family.image_main_sha256 || null, variantCount: family.items.length,
    reference: family.items.length === 1 ? family.items[0]!.public_item_key : null,
    single: family.items.length === 1 ? {
      public_item_key: family.items[0]!.public_item_key,
      variant_axes: family.items[0]!.variant_axes,
      axes: family.axes.map((a) => ({ label: a.label, value: family.items[0]!.variant_axes[a.axis_key] ?? "" })),
    } : null,
    axes: family.axes.map((a) => a.label), priceText: priceText(price),
    best: lowest !== null && price !== null && cents(price.amount) === lowest,
  }));
  return { found, missing };
}
