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
import { applyFilters, pageFilters as filtersOf, parseFilterChoice } from "@/lib/site-catalog/filters";
import { listFamilies, parseListingQuery } from "@/lib/site-catalog/listing";
import { count } from "@/components/site/format";
import { isPromoNow, novelFamilies } from "@/lib/site-catalog/merchandising";
import { orderRubric } from "@/lib/site-catalog/rubric-order";
import { rubricImage } from "@/lib/site-catalog/rubric-image";
import { getShopSettings } from "@/lib/site-shop/source";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogForPage } from "@/lib/site-catalog/page";
import { MediaImage } from "@/components/site/media-image";
import { absolute, categoryPath, publicOrigin } from "@/lib/seo/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const cat = nav.node(key);
  // Une rubrique sans aucune famille (ni dans son sous-arbre) reste servie, mais ne doit jamais être indexée.
  const empty = cat !== null && cat.subtreeFamilyCount === 0;
  // 3.13 / 3.19 (S05) : titre et description de référencement de la rubrique (catalogue v2), sinon son nom ; adresse canonique.
  const seo = catalog.categories.find((c) => c.category_key === key) as { seo_title?: string | null; seo_description?: string | null } | undefined;
  const canonical = cat ? absolute(publicOrigin(process.env.SITE_PUBLIC_ORIGIN), categoryPath(key)) : null;
  return {
    title: seo?.seo_title || (cat?.name ?? "Catégorie introuvable"),
    ...(seo?.seo_description ? { description: seo.seo_description } : {}),
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(empty ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Catégorie : familles de tout le sous-arbre, classées en principal ou en secondaire (ordre du DTO). */
export default async function CategoryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { key } = await params;
  const sp = await searchParams;
  const query = parseListingQuery(sp);
  const choice = parseFilterChoice(sp);
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const cat = nav.node(key);
  if (!cat) notFound();
  const children = nav.visibleChildren(cat.key);
  const slugs = new Set(nav.familySlugs(cat.key));
  // Ordre par défaut = celui que la Factory a donné à la rubrique (cercle 3, 3.21) ; le tri choisi par le visiteur reste possible.
  const bySlug = new Map(catalog.families.map((f) => [f.slug, f]));
  const record = catalog.categories.find((c) => c.category_key === key);
  const now = serverNowUtc();
  // CA-5 : l'ordre par défaut de la rubrique (gamme propre, promotions, nouveautés, le reste ; le rangement à la main joue à l'intérieur de chaque groupe), à l'instant servi.
  const shop = await getShopSettings();
  const noveltySlugs = new Set(novelFamilies(catalog.families, now, shop.noveltyDays, shop.noveltyCount).map((f) => f.slug));
  const allFamilies = orderRubric(nav.familySlugs(cat.key).flatMap((slug) => { const f = bySlug.get(slug); return f && slugs.has(slug) ? [f] : []; }), key, now, noveltySlugs);
  // CA-6 a : l'image choisie dans la Factory, sinon celle de la première famille dans l'ordre de la rubrique (avant les filtres et le tri du visiteur).
  const image = rubricImage(record?.image_sha256, allFamilies);
  // 4.27 : les filtres se calculent sur toutes les familles listées (sous-arbre) ; OU dans un filtre, ET entre filtres et avec le prix.
  const groups = filtersOf(allFamilies);
  const families = applyFilters(allFamilies, groups, choice);
  const listing = listFamilies(families, query, (f) => familyPrice(catalog, f, now));
  const pageParams: Record<string, string> = {};
  if (query.minRaw.trim() !== "") pageParams["prix_min"] = query.minRaw;
  if (query.maxRaw.trim() !== "") pageParams["prix_max"] = query.maxRaw;
  if (query.sort !== "pertinence") pageParams["tri"] = query.sort;
  const pageFilters: Record<string, string[]> = {};
  for (const g of groups) {
    const chosen = (choice[g.param] ?? []).filter((v) => g.options.some((o) => o.value === v));
    if (chosen.length > 0) pageFilters[g.param] = chosen;
  }
  const notes: Record<string, string> = {};
  for (const f of allFamilies) {
    const anchor = nav.anchor(f.primary_category_key);
    if (anchor === null || !nav.chain(anchor).some((n) => n.key === key)) notes[f.slug] = "classée aussi ici";
  }
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, key)]} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{cat.name}</h1>
        {(record?.intro_text || image) && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start" data-testid="category-intro">
            {image && <div className="w-full sm:w-64 sm:shrink-0" data-image-source={image.source}><MediaImage sha256={image.sha256} alt={cat.name} className="aspect-[4/3] w-full rounded-[14px] border border-line" /></div>}
            {record?.intro_text && <p className="max-w-[70ch] whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]">{record.intro_text}</p>}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p role="status" className="min-w-0 text-sm text-ink-2" data-testid="category-count">{count(listing.total)} famille{listing.total > 1 ? "s" : ""} dans cette catégorie.</p>
          {allFamilies.length > 0 && <ListingSort formId="category-filters" sort={query.sort} />}
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
          {allFamilies.length > 0 && <ListingControls formId="category-filters" action={`/categorie/${key}`} query={query} filters={groups} choice={choice} />}
          <div className="hidden lg:block"><QuickOrder /></div>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          {allFamilies.length === 0 ? (
            <p className="rounded-[14px] border border-line bg-white p-4 text-ink-2">
              Aucune famille dans cette catégorie pour le moment.
            </p>
          ) : listing.rows.length === 0 ? (
            <p role="status" className="rounded-[14px] border border-line bg-white p-4 text-ink-2">Aucune famille ne correspond à ces filtres.</p>
          ) : (
            <FamilyGrid prices families={listing.rows.map((r) => ({ ...familyCard(r.family), from: r.price, promo: isPromoNow(r.family, now) }))} label={`Familles de la catégorie ${cat.name}`} notes={notes} />
          )}
          <Pager action={`/categorie/${key}`} params={{ ...pageParams, ...pageFilters }} page={listing.page} pages={listing.pages} />
          {/* Sur mobile, la commande rapide passe après les produits (elle gardait trois blocs avant la liste) */}
          <div className="lg:hidden"><QuickOrder /></div>
        </div>
      </div>
    </div>
  );
}
