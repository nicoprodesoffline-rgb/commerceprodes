// Résolution de variante : module PUR, partagé client (sélecteur) / serveur
// (revalidation). Une combinaison est achetable seulement si un item READY du
// payload la porte EXACTEMENT et qu'elle n'est pas interdite.
import type { FamilyView, ItemView, VariantAxes } from "./types";

export function sameAxes(a: VariantAxes, b: VariantAxes): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export function isForbidden(family: FamilyView, axes: VariantAxes): boolean {
  return family.forbidden_combinations.some((combo) =>
    Object.entries(combo).every(([k, v]) => axes[k] === v),
  );
}

export type VariantResolution =
  | { ok: true; item: ItemView }
  | { ok: false; reason: "FORBIDDEN" | "ABSENT" };

export function resolveVariant(family: FamilyView, axes: VariantAxes): VariantResolution {
  if (isForbidden(family, axes)) return { ok: false, reason: "FORBIDDEN" };
  const item = family.items.find((i) => sameAxes(i.variant_axes, axes));
  return item ? { ok: true, item } : { ok: false, reason: "ABSENT" };
}

export type AxisValueState = "available" | "absent" | "forbidden";

// État d'une valeur d'axe, les autres axes restant fixés à la sélection courante.
export function axisValueState(
  family: FamilyView,
  selection: VariantAxes,
  axis: string,
  value: string,
): AxisValueState {
  const candidate = { ...selection, [axis]: value };
  const r = resolveVariant(family, candidate);
  if (r.ok) return "available";
  return r.reason === "FORBIDDEN" ? "forbidden" : "absent";
}

// La sélection de variante vit dans l'URL (?axe=valeur) ; lue de la même façon
// par la page serveur (galerie) et par le composant client (sélecteur).
// Sans sélection complète : axes du premier item READY.
export function selectionFromParams(
  family: FamilyView,
  get: (k: string) => string | null,
): VariantAxes {
  const fromUrl: VariantAxes = {};
  for (const a of family.variant_axes_schema) {
    const v = get(a.axis);
    if (v !== null) fromUrl[a.axis] = v;
  }
  if (Object.keys(fromUrl).length === family.variant_axes_schema.length) return fromUrl;
  return { ...(family.items[0]?.variant_axes ?? {}) };
}
