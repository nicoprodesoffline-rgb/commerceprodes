import type { Metadata } from "next";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SEARCH_MAX, familyCard, searchFamilies } from "@/components/site/catalog-views";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recherche" };

/** Recherche serveur simple (nom / slug de Famille, ou référence `PI-…`). La requête est rendue échappée par React. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").slice(0, SEARCH_MAX);
  const catalog = await catalogForPage();
  const results = searchFamilies(catalog, q);
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Recherche" }]} />
      <h1 className="text-2xl font-semibold">Recherche</h1>
      <form role="search" action="/recherche" method="get" className="flex max-w-xl gap-2">
        <label htmlFor="q-page" className="sr-only">Rechercher une famille de produits</label>
        <input id="q-page" name="q" type="search" defaultValue={q} maxLength={SEARCH_MAX} className="h-[42px] min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white px-3" />
        <button type="submit" className="h-[42px] rounded-[9px] bg-ink px-4 font-medium text-white">Rechercher</button>
      </form>
      <p role="status" className="text-ink-2" data-testid="search-count">
        {q.trim() === ""
          ? "Saisissez un nom de famille ou une référence (PI-…)."
          : results.length === 0
            ? <>Aucune famille ne correspond à « <span className="font-medium text-ink">{q}</span> ».</>
            : <>{results.length} famille{results.length > 1 ? "s" : ""} pour « <span className="font-medium text-ink">{q}</span> ».</>}
      </p>
      {results.length > 0 && <FamilyGrid families={results.map(familyCard)} label="Résultats de recherche" />}
    </div>
  );
}
