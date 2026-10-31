/**
 * Base fiscale que la génération ACTIVE déclare (`tax_basis_or_status` de ses fenêtres de prix). Règle : le site n'affirme jamais une base fiscale que la donnée ne porte pas.
 * « Prix HT » (ou « hors taxes ») n'est donc écrit que si TOUTES les fenêtres publiées déclarent `HT` ; dans tous les autres cas (« non précisée », bases mêlées, aucun prix),
 * la formule neutre ci-dessous. Ce que la Factory doit publier comme base fiscale est une question ouverte du propriétaire : ce module ne la tranche pas.
 */
import type { Family } from "./catalog";

export type CatalogBasis = "HT" | "NOT_DECLARED";
export const NEUTRAL_BASIS_TEXT = "Les prix et la base fiscale sont précisés sur le devis.";

const memo = new Map<string, CatalogBasis>();

export function catalogBasis(families: readonly Family[], key?: string): CatalogBasis {
  const hit = key === undefined ? undefined : memo.get(key);
  if (hit !== undefined) return hit;
  let seen = 0;
  let allHt = true;
  outer: for (const f of families) {
    for (const item of f.items) {
      for (const w of item.windows) {
        seen += 1;
        if (w.tax_basis_or_status !== "HT") {
          allHt = false;
          break outer;
        }
      }
    }
  }
  const result: CatalogBasis = seen > 0 && allHt ? "HT" : "NOT_DECLARED";
  if (key !== undefined) {
    if (memo.size > 8) memo.clear();
    memo.set(key, result);
  }
  return result;
}
