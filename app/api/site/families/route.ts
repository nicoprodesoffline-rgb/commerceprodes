import { navigationOf } from "@/components/site/catalog-views";
import { price } from "@/components/site/format";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { lookUp, parseSlugs } from "@/lib/site-catalog/family-lookup";
import { escapedJson as json } from "@/lib/site-catalog/json-response";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogOrNull } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

/**
 * Familles publiées par adresse (lecture seule, GET) : jusqu'à 20 slugs valides, dans l'ordre demandé, avec nom, catégorie, image, nombre de variantes et prix « à partir de »
 * tel que le serveur le retient. Alimente les favoris, le comparateur et les « récemment consultés » (mémoires du navigateur). Aucune donnée hors catalogue publié ;
 * catalogue indisponible : 503, jamais une liste vide.
 */
export async function GET(req: Request) {
  const slugs = parseSlugs(new URL(req.url).searchParams.get("slugs"));
  const catalog = await catalogOrNull();
  if (catalog === null) return json({ families: [], missing: [], unavailable: true }, 503);
  let now: string;
  try {
    now = serverNowUtc();
  } catch {
    return json({ families: [], missing: [], unavailable: true }, 503);
  }
  const nav = navigationOf(catalog);
  const { found, missing } = lookUp(
    slugs, (s) => catalog.familyBySlug(s), (f) => familyPrice(catalog, f, now),
    (p) => (p === null ? "Sur devis" : `À partir de ${price(p.amount, p.basis)}`),
    (f) => nav.node(nav.anchor(f.primary_category_key) ?? "")?.name ?? null,
  );
  return json({ families: found, missing });
}
