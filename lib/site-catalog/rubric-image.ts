/**
 * CA-6 a (cercle A, Owner A.9 ; EC, 26/11) — l'image d'une rubrique. Fonction PURE, la même pour la page de la rubrique et pour l'accueil.
 *
 * L'image choisie dans la Factory (`image_sha256` de la rubrique) l'emporte (Q1 tranchée : le choix à la main). Sinon, l'image principale de la
 * PREMIÈRE famille, dans l'ordre de la rubrique (`orderRubric`, CA-5), qui en a une. Cet ordre dépend de l'instant servi (une promotion qui commence,
 * une nouveauté qui expire) : l'image automatique peut donc changer d'un jour à l'autre, sans nouvel envoi de la Factory.
 */
import type { Family } from "./catalog";

export type RubricImage = { sha256: string; source: "chosen" | "automatic" };

export function rubricImage(chosen: string | null | undefined, orderedFamilies: readonly Family[]): RubricImage | null {
  if (chosen) return { sha256: chosen, source: "chosen" };
  const first = orderedFamilies.find((f) => f.image_main_sha256);
  return first?.image_main_sha256 ? { sha256: first.image_main_sha256, source: "automatic" } : null;
}
