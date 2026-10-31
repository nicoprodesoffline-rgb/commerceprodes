import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategorySidebar } from "@/components/catalog/category-sidebar";
import { ListingControls } from "@/components/catalog/listing-controls";
import { Pager } from "@/components/catalog/pager";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { categoryCrumbs, familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { listFamilies, parseListingQuery } from "@/lib/site-catalog/listing";
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

/** Catégorie : sous-catégories, familles classées ici en principal puis via `secondary_category_keys` (DTO). */
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
  for (const f of families) if (nav.anchor(f.primary_category_key) !== key) notes[f.slug] = "classée aussi ici";
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, key)]} />
      <h1 className="text-2xl font-semibold">{cat.name}</h1>
      {children.length > 0 && (
        <nav aria-label="Sous-catégories">
          <ul className="flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.key}>
                <Link href={`/categorie/${c.key}`} className="inline-flex min-h-[34px] items-center rounded-full border border-line-strong bg-white px-3 text-sm hover:bg-surface">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <p className="text-sm text-ink-2" data-testid="category-count">{listing.total} famille{listing.total > 1 ? "s" : ""} dans cette catégorie.</p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <CategorySidebar roots={nav.menu} current={key} />
        <div className="min-w-0 flex-1 space-y-4">
          {families.length > 0 && <ListingControls action={`/categorie/${key}`} query={query} />}
          {families.length === 0 ? (
            <p className="rounded-[14px] border border-line bg-white p-4 text-ink-2">
              Aucune famille n&apos;est classée directement dans cette catégorie{children.length > 0 ? " : consultez ses sous-catégories." : "."}
            </p>
          ) : listing.rows.length === 0 ? (
            <p role="status" className="rounded-[14px] border border-line bg-white p-4 text-ink-2">Aucune famille ne correspond à ces filtres.</p>
          ) : (
            <FamilyGrid prices families={listing.rows.map((r) => ({ ...familyCard(r.family), from: r.price }))} label={`Familles de la catégorie ${cat.name}`} notes={notes} />
          )}
          <Pager action={`/categorie/${key}`} params={pageParams} page={listing.page} pages={listing.pages} />
        </div>
      </div>
    </div>
  );
}
