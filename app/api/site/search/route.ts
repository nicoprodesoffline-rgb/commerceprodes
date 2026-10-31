import { NextResponse } from "next/server";
import { navigationOf, SEARCH_MAX, searchFamilies } from "@/components/site/catalog-views";
import { price } from "@/components/site/format";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogOrNull } from "@/lib/site-catalog/page";
import { SUGGEST_MIN, suggestionsOf } from "@/lib/site-catalog/suggest";

export const dynamic = "force-dynamic";

/**
 * Recherche instantanée (lecture seule, GET) : jusqu'à 8 Familles publiées dont le nom (ou la référence `PI-…`) correspond, avec leur image, leur catégorie et leur
 * prix « à partir de » TEL QUE LE SERVEUR LE RETIENT. Aucune écriture, aucune donnée hors catalogue publié. Catalogue indisponible : 503, jamais une liste vide.
 */
export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("q") ?? "").slice(0, SEARCH_MAX);
  const headers = { "cache-control": "no-store" };
  const catalog = await catalogOrNull();
  if (catalog === null) return NextResponse.json({ results: [], total: 0, unavailable: true }, { status: 503, headers });
  if (raw.trim().length < SUGGEST_MIN) return NextResponse.json({ results: [], total: 0, query: raw }, { headers });
  let now: string;
  try {
    now = serverNowUtc();
  } catch {
    return NextResponse.json({ results: [], total: 0, unavailable: true }, { status: 503, headers });
  }
  const found = searchFamilies(catalog, raw);
  const nav = navigationOf(catalog);
  const results = suggestionsOf(
    found,
    (p) => (p === null ? "Sur devis" : `À partir de ${price(p.amount, p.basis)}`),
    (f) => nav.node(nav.anchor(f.primary_category_key) ?? "")?.name ?? null,
    (f) => familyPrice(catalog, f, now),
  );
  return NextResponse.json({ results, total: found.length, query: raw }, { headers });
}
