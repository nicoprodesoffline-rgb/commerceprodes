import Link from "next/link";
import type { Metadata } from "next";
import { PageSections } from "@/components/content/sections";
import { getEditorialSet } from "@/lib/site-content/source";
import { editorialMetadata } from "@/lib/site-content/metadata";
import { CategoryGrid } from "@/components/home/category-grid";
import { FamilyGrid } from "@/components/home/family-card";
import { Hero, ProIntensBlock, QuoteBanner, TrustBar } from "@/components/home/hero";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogBasis } from "@/lib/site-catalog/basis";
import { catalogForPage } from "@/lib/site-catalog/page";
import type { NavNode } from "@/lib/site-catalog/navigation";

export const dynamic = "force-dynamic";
const HOME_FAMILIES = 12;

export async function generateMetadata(): Promise<Metadata> {
  const page = (await getEditorialSet())?.pages.find(p => p.slug === "/");
  return page ? editorialMetadata(page, process.env.SITE_PUBLIC_ORIGIN) : {};
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
  const page = (await getEditorialSet())?.pages.find(p => p.slug === "/");
  if (page) return (
    <div className="min-w-0">
      {page.sections[0]?.type !== "hero" && <h1 className="mb-6 whitespace-pre-line text-3xl font-semibold [overflow-wrap:anywhere]">{page.title}</h1>}
      <PageSections page={page} catalog={catalog} />
    </div>
  );
  const nav = navigationOf(catalog);
  const roots = nav.menu.map((n) => {
    // Une catégorie racine peut ne porter ses familles que dans ses sous-catégories : le compte et l'image tiennent compte de tout son sous-arbre.
    const subtree = (node: NavNode): string[] => [...nav.familySlugs(node.key), ...node.children.flatMap(subtree)];
    const familySlugs = new Set(subtree(n));
    return {
      key: n.key,
      name: n.name,
      familyCount: n.subtreeFamilyCount,
      imageSha: catalog.families.find((f) => familySlugs.has(f.slug) && f.image_main_sha256)?.image_main_sha256 ?? null,
      children: n.children.map((s) => ({ key: s.key, name: s.name })),
    };
  });
  const references = catalog.families.reduce((n, f) => n + f.items.length, 0);
  const proIntens = findNode(nav.menu, (n) => /pro[\s-]?intens/i.test(n.name));
  const basis = catalogBasis(catalog.families, catalog.meta.payload_sha256);
  const now = serverNowUtc();
  const shown = catalog.families.slice(0, HOME_FAMILIES);
  return (
    <div className="space-y-10">
      <Hero references={references} basis={basis} />
      <TrustBar references={references} basis={basis} />
      <section id="categories" aria-labelledby="cat-h">
        <h2 id="cat-h" className="mb-3 text-lg font-semibold">Nos univers produits</h2>
        <CategoryGrid categories={roots} />
      </section>
      <ProIntensBlock category={proIntens ? { key: proIntens.key, name: proIntens.name } : null} />
      <section id="familles" aria-labelledby="fam-h">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="fam-h" className="text-lg font-semibold">
            Familles <span className="text-sm font-normal text-ink-3">({catalog.families.length})</span>
          </h2>
          {catalog.families.length > shown.length && <Link href="/recherche" className="inline-flex min-h-[34px] items-center text-sm font-medium underline-offset-2 hover:underline">Voir tout le catalogue →</Link>}
        </div>
        <FamilyGrid prices families={shown.map((f) => ({ ...familyCard(f), from: familyPrice(catalog, f, now) }))} label="Familles publiées" />
      </section>
      <QuoteBanner />
    </div>
  );
}
