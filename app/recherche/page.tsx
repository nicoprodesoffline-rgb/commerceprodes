import type { Metadata } from "next";
import { CategorySidebar } from "@/components/catalog/category-sidebar";
import { ListingControls } from "@/components/catalog/listing-controls";
import { ListingSort } from "@/components/catalog/listing-sort";
import { Pager } from "@/components/catalog/pager";
import { QuickOrder } from "@/components/catalog/quick-order";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SEARCH_MAX, familyCard, navigationOf, searchFamilies } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { listFamilies, parseListingQuery } from "@/lib/site-catalog/listing";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalogue" };

/**
 * Tout le catalogue, ou les résultats d'une recherche serveur (nom / slug de Famille, ou référence `PI-…`). Filtre de prix, tri et pages dans l'adresse.
 * La requête est rendue échappée par React ; le prix de chaque carte est celui que le serveur retient à l'instant du rendu.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseListingQuery(await searchParams, SEARCH_MAX);
  const q = query.q;
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const base = q.trim() === "" ? catalog.families : searchFamilies(catalog, q);
  const now = serverNowUtc();
  const listing = listFamilies(base, query, (f) => familyPrice(catalog, f, now));
  const params: Record<string, string> = {};
  if (q.trim() !== "") params["q"] = q;
  if (query.minRaw.trim() !== "") params["prix_min"] = query.minRaw;
  if (query.maxRaw.trim() !== "") params["prix_max"] = query.maxRaw;
  if (query.sort !== "pertinence") params["tri"] = query.sort;
  const categoryOf = (key: string) => nav.node(nav.anchor(key) ?? "")?.name;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: q.trim() === "" ? "Catalogue" : "Recherche" }]} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{q.trim() === "" ? "Tout le catalogue" : <>Résultats pour « <span data-testid="search-term">{q}</span> »</>}</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p role="status" className="min-w-0 text-ink-2" data-testid="search-count">
            {listing.total === 0
              ? q.trim() === ""
                ? "Aucune famille ne correspond à ces filtres."
                : <>Aucune famille ne correspond à « <span className="font-medium text-ink">{q}</span> »{listing.filtered ? " avec ces filtres" : ""}.</>
              : q.trim() === ""
                ? <>{listing.total} famille{listing.total > 1 ? "s" : ""}.</>
                : <>{listing.total} famille{listing.total > 1 ? "s" : ""} pour « <span className="font-medium text-ink">{q}</span> ».</>}
          </p>
          <ListingSort formId="search-filters" sort={query.sort} />
        </div>
      </div>
      <form role="search" action="/recherche" method="get" className="flex max-w-xl gap-2">
        <label htmlFor="q-page" className="sr-only">Rechercher une famille de produits</label>
        <input id="q-page" name="q" type="search" defaultValue={q} maxLength={SEARCH_MAX} placeholder="Nom de famille ou référence PI-…" className="h-[42px] min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white px-3" />
        <button type="submit" className="h-[42px] rounded-[9px] bg-ink px-4 font-medium text-white">Rechercher</button>
      </form>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 space-y-4 lg:w-60 lg:shrink-0">
          <CategorySidebar roots={nav.menu} />
          <ListingControls formId="search-filters" action="/recherche" query={query} hidden={q.trim() === "" ? undefined : { q }} />
          <QuickOrder />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          {listing.rows.length > 0 && (
            <FamilyGrid prices label="Familles du catalogue" families={listing.rows.map((r) => ({ ...familyCard(r.family), from: r.price, ...(categoryOf(r.family.primary_category_key) ? { category: categoryOf(r.family.primary_category_key) as string } : {}) }))} />
          )}
          <Pager action="/recherche" params={params} page={listing.page} pages={listing.pages} />
        </div>
      </div>
    </div>
  );
}
