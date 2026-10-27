/**
 * `selectPrice` C0 sur la génération servie (W6-P, Owner A14). Le calcul est celui de C0, sans aucune réécriture :
 * - document VÉRIFIÉ par `lib/site-db/generation.ts` (gelé, SHA contrôlé) : la `Generation` C0 est construite UNE fois
 *   par objet document (WeakMap) puis passée à `selectPriceIn` ;
 * - tout autre document (fixture, test) : `selectPrice` de C0 (construction à chaque appel, comportement d'origine).
 * Aucune persistance entre processus, aucune clé de valeur : l'identité d'objet d'un document vérifié est la seule clé.
 */
import { Generation, selectPrice, selectPriceIn, type SelectResult } from "../../c0/ts/src/business";
import type { Json } from "../../c0/ts/src/jsonc";
import { isVerified } from "./verified";

const generations = new WeakMap<object, Generation>();

export function selectPriceOnServed(
  generation: { snapshot: Json; status: "ACTIVE" | "UNSAFE" },
  publicItemKey: Json,
  variantAxes: Json,
  quantity: Json,
  instantUtc: Json,
): SelectResult {
  const doc = generation.snapshot;
  if (generation.status === "ACTIVE" && isVerified(doc)) {
    let built = generations.get(doc);
    if (built === undefined) {
      built = new Generation({ snapshot: doc as Json, status: "ACTIVE" });
      generations.set(doc, built);
    }
    return selectPriceIn(built, publicItemKey, variantAxes, quantity, instantUtc);
  }
  return selectPrice(generation as unknown as Json, publicItemKey, variantAxes, quantity, instantUtc);
}
