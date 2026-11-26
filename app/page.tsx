import Link from "next/link";
import type { Metadata } from "next";
import { absolute, publicOrigin } from "@/lib/seo/seo";
import { PageSections } from "@/components/content/sections";
import { getEditorialSet } from "@/lib/site-content/source";
import { livePage } from "@/lib/site-content/blocks";
import { editorialMetadata } from "@/lib/site-content/metadata";
import { CategoryGrid } from "@/components/home/category-grid";
import { FamilyGrid } from "@/components/home/family-card";
import { Hero, ProIntensBlock, QuoteBanner, TrustBar } from "@/components/home/hero";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { imagesAllowed } from "@/lib/site-catalog/media-policy";
import { catalogBasis } from "@/lib/site-catalog/basis";
import { catalogForPage } from "@/lib/site-catalog/page";
import { getShopSettings } from "@/lib/site-shop/source";
import { novelFamilies } from "@/lib/site-catalog/merchandising";
import { orderRubric } from "@/lib/site-catalog/rubric-order";
import { rubricImage } from "@/lib/site-catalog/rubric-image";
import type { NavNode } from "@/lib/site-catalog/navigation";

export const dynamic = "force-dynamic";
const HOME_FAMILIES = 12;

export async function generateMetadata(): Promise<Metadata> {
  const found = (await getEditorialSet())?.pages.find(p => p.slug === "/");
  // CA-4 : les blocs hors de leurs dates ne sont pas dessinés, tous types confondus, avant même de chercher le bandeau ou la grille.
  const page = found ? livePage(found, serverNowUtc()) : found;
  // 3.19 (S11) : l'accueil a sa canonique, même sans page éditoriale.
  const canonical = absolute(publicOrigin(process.env.SITE_PUBLIC_ORIGIN), "/");
  const metadata = page ? editorialMetadata({ ...page, canonical: page.canonical || "/" }, process.env.SITE_PUBLIC_ORIGIN) : {};
  return canonical && !metadata.alternates ? { ...metadata, alternates: { canonical } } : metadata;
}

function findNode(nodes: NavNode[], match: (n: NavNode) => boolean): NavNode | null {
  for (const n of nodes) {
    if (match(n)) return n;
    const inner = findNode(n.children, match);
    if (inner) return inner;
  }
  return null;
}

/**
 * Accueil : accroche, réassurance, catégories racines, gamme PRO-INTENS si la Factory la publie, quelques familles (ordre du DTO, aucune règle de mise en avant
 * inventée), appel au devis. Les « Nouveautés » de l'ancien site n'existent pas : C0 ne publie pas de date de mise en ligne.
 */
export default async function HomePage() {
  const catalog = await catalogForPage();
  const shop = await getShopSettings();
  const found = (await getEditorialSet())?.pages.find(p => p.slug === "/");
  // CA-4 : les blocs hors de leurs dates ne sont pas dessinés, tous types confondus, avant même de chercher le bandeau ou la grille.
  const page = found ? livePage(found, serverNowUtc()) : found;
  const nav = navigationOf(catalog);
  const categorySection = page?.sections.find(section => section.type === "category_grid");
  const rootNodes = categorySection ? categorySection.data.categories.flatMap(key => { const node = nav.node(key); return node ? [node] : []; }) : nav.menu;
  const now = serverNowUtc();
  const bySlug = new Map(catalog.families.map((f) => [f.slug, f]));
  // Les nouveautés ne servent qu'à ranger les familles des rubriques montrées : sans rubrique, rien à calculer.
  const noveltySlugs = rootNodes.length > 0 ? new Set(novelFamilies(catalog.families, now, shop.noveltyDays, shop.noveltyCount).map((f) => f.slug)) : new Set<string>();
  const roots = rootNodes.filter(n => n.subtreeFamilyCount > 0).map((n) => {
    // Une catégorie racine peut ne porter ses familles que dans ses sous-catégories : le compte et l'image tiennent compte de tout son sous-arbre.
    // CA-6 a : la même règle que la page de la rubrique (l'image choisie, sinon celle de la première famille dans l'ordre de la rubrique).
    const familiesInOrder = orderRubric(nav.familySlugs(n.key).flatMap((slug) => { const f = bySlug.get(slug); return f ? [f] : []; }), n.key, now, noveltySlugs);
    return {
      key: n.key,
      name: n.name,
      familyCount: n.subtreeFamilyCount,
      imageSha: rubricImage(catalog.categories.find((c) => c.category_key === n.key)?.image_sha256, familiesInOrder)?.sha256 ?? null,
      intro: catalog.categories.find((c) => c.category_key === n.key)?.intro_text ?? null,
      children: n.children.map((s) => ({ key: s.key, name: s.name })),
    };
  });
  const references = catalog.families.reduce((n, f) => n + f.items.length, 0);
  const proIntens = findNode(nav.menu, (n) => /pro[\s-]?intens/i.test(n.name));
  const basis = catalogBasis(catalog.families, catalog.meta.payload_sha256);
  const featuredSection = page?.sections.find(section => section.type === "product_carousel");
  const featured = featuredSection ? featuredSection.data.families.flatMap(key => { const family = catalog.families.find(f => f.public_family_key === key); return family ? [family] : []; }) : catalog.families;
  const shown = featured.slice(0, HOME_FAMILIES);
  const hero = page?.sections.find(section => section.type === "hero");
  // Cercle 3 (B11) : l'image du bandeau choisie dans la Factory remplace l'image prise automatiquement.
  const heroImage = imagesAllowed(catalog.meta.data_label) ? (hero?.data.imageSha ?? shown.find(f => f.image_main_sha256)?.image_main_sha256) : null;
  const contentSections = page?.sections.filter(section => section !== hero && section !== categorySection && section !== featuredSection) ?? [];
  return (
    <div className="min-w-0 space-y-12 lg:space-y-16">
      <div>
        <div className={`grid min-w-0 gap-6 ${roots.length > 0 ? "lg:grid-cols-[240px_minmax(0,1fr)]" : ""}`}>
          {roots.length > 0 && <aside aria-label="Parcourir les catégories" className="hidden self-start border border-line lg:block">
            <h2 className="bg-brand px-5 py-5 text-base font-extrabold uppercase text-white">Catégories</h2>
            <ul className="divide-y divide-line">
              {roots.map(category => <li key={category.key}><Link href={`/categorie/${category.key}`} className="flex min-h-12 items-center justify-between gap-3 px-5 py-3 text-sm font-semibold [overflow-wrap:anywhere] hover:bg-brand-subtle hover:text-brand">{category.name}<span aria-hidden="true">›</span></Link></li>)}
            </ul>
            <Link href="/recherche" className="flex min-h-12 items-center border-t border-line px-5 text-sm font-bold text-brand hover:underline">Tout le catalogue →</Link>
          </aside>}
          <Hero references={references} imageSha={heroImage} title={hero?.data.title ?? page?.title} text={hero?.data.text} link={hero?.data.link} linkLabel={hero?.data.linkLabel} />
        </div>
        <TrustBar references={references} basis={basis} shop={shop} />
      </div>
      {roots.length > 0 && <section id="categories" aria-labelledby="cat-h">
        <h2 id="cat-h" className="commerce-section-title mb-6">{categorySection?.data.title || "Nos univers produits"}</h2>
        <CategoryGrid categories={roots} />
      </section>}
      <ProIntensBlock category={proIntens ? { key: proIntens.key, name: proIntens.name } : null} />
      {shown.length > 0 && <section id="familles" aria-labelledby="fam-h">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="fam-h" className="commerce-section-title">{featuredSection?.data.title || "À découvrir au catalogue"}</h2>
          <Link href="/recherche" className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline">Voir tout le catalogue →</Link>
        </div>
        <FamilyGrid prices families={shown.map(f => ({ ...familyCard(f), from: familyPrice(catalog, f, now) }))} label="Produits à découvrir" />
      </section>}
      {page && contentSections.length > 0 && <PageSections page={{ ...page, sections: contentSections }} catalog={catalog} />}
      <QuoteBanner />
    </div>
  );
}
