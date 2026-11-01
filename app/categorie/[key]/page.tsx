import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategorySidebar } from "@/components/catalog/category-sidebar";
import { ListingControls } from "@/components/catalog/listing-controls";
import { ListingSort } from "@/components/catalog/listing-sort";
import { Pager } from "@/components/catalog/pager";
import { QuickOrder } from "@/components/catalog/quick-order";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { categoryCrumbs, familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { listFamilies, parseListingQuery } from "@/lib/site-catalog/listing";
import { count } from "@/components/site/format";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const cat = nav.node(key);
  // Une rubrique sans aucune famille (ni dans son sous-arbre) reste servie, mais ne doit jamais être indexée.
  const empty = cat !== null && cat.subtreeFamilyCount === 0;
  return { title: cat?.name ?? "Catégorie introuvable", ...(empty ? { robots: { index: false, follow: true } } : {}) };
}

/** Catégorie : familles de tout le sous-arbre, classées en principal ou en secondaire (ordre du DTO). */
export default async function CategoryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { key } = await params;
  const query = parseListingQuery(await searchParams);
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const cat = nav.node(key);
  if (!cat) notFound();
  const children = nav.visibleChildren(cat.key);
  const slugs = new Set(nav.familySlugs(cat.key));
  const families = catalog.families.filter((f) => slugs.has(f.slug));
  const now = serverNowUtc();
  const listing = listFamilies(families, query, (f) => familyPrice(catalog, f, now));
  const pageParams: Record<string, string> = {};
  if (query.minRaw.trim() !== "") pageParams["prix_min"] = query.minRaw;
  if (query.maxRaw.trim() !== "") pageParams["prix_max"] = query.maxRaw;
  if (query.sort !== "pertinence") pageParams["tri"] = query.sort;
  const notes: Record<string, string> = {};
  for (const f of families) {
    const anchor = nav.anchor(f.primary_category_key);
    if (anchor === null || !nav.chain(anchor).some((n) => n.key === key)) notes[f.slug] = "classée aussi ici";
  }
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, key)]} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{cat.name}</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p role="status" className="min-w-0 text-sm text-ink-2" data-testid="category-count">{count(listing.total)} famille{listing.total > 1 ? "s" : ""} dans cette catégorie.</p>
          {families.length > 0 && <ListingSort formId="category-filters" sort={query.sort} />}
        </div>
      </div>
      {children.length > 0 && (
        <nav aria-label="Sous-catégories" className="hidden lg:block">
          <ul className="flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.key}>
                <Link href={`/categorie/${c.key}`} className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong bg-white px-3 text-sm hover:bg-surface">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 space-y-4 lg:w-60 lg:shrink-0">
          <CategorySidebar roots={nav.menu} current={key} subcategories={children.map((c) => ({ key: c.key, name: c.name }))} />
          {families.length > 0 && <ListingControls formId="category-filters" action={`/categorie/${key}`} query={query} />}
          <div className="hidden lg:block"><QuickOrder /></div>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          {families.length === 0 ? (
            <p className="rounded-[14px] border border-line bg-white p-4 text-ink-2">
              Aucune famille dans cette catégorie pour le moment.
            </p>
          ) : listing.rows.length === 0 ? (
            <p role="status" className="rounded-[14px] border border-line bg-white p-4 text-ink-2">Aucune famille ne correspond à ces filtres.</p>
          ) : (
            <FamilyGrid prices families={listing.rows.map((r) => ({ ...familyCard(r.family), from: r.price }))} label={`Familles de la catégorie ${cat.name}`} notes={notes} />
          )}
          <Pager action={`/categorie/${key}`} params={pageParams} page={listing.page} pages={listing.pages} />
          {/* Sur mobile, la commande rapide passe après les produits (elle gardait trois blocs avant la liste) */}
          <div className="lg:hidden"><QuickOrder /></div>
        </div>
      </div>
    </div>
  );
}
