import type { Metadata } from "next";
import Link from "next/link";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogForPage } from "@/lib/site-catalog/page";
import type { NavNode } from "@/lib/site-catalog/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gamme PRO-INTENS" };

function findNode(nodes: NavNode[]): NavNode | null {
  for (const n of nodes) {
    if (/pro[\s-]?intens/i.test(n.name)) return n;
    const inner = findNode(n.children);
    if (inner) return inner;
  }
  return null;
}

/**
 * Gamme PRO-INTENS (V-E14, C11) : une catégorie tenue dans la Factory. La page liste les familles de cette catégorie ; sans catégorie publiée, état vide dit simplement, sans promettre de date (aucune date validée par le propriétaire).
 * Arguments : « NF certifié » et « Chorus Pro compatible » gardés tels quels (C8) ; la garantie de 10 ans de l'ancien site n'est pas reprise (C7 : aucune garantie générale).
 */
export default async function ProIntensPage() {
  const catalog = await catalogForPage();
  const nav = navigationOf(catalog);
  const node = findNode(nav.menu);
  const slugs = node ? new Set(nav.familySlugs(node.key)) : new Set<string>();
  const families = catalog.families.filter((f) => slugs.has(f.slug));
  const now = serverNowUtc();
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Gamme PRO-INTENS" }]} />
      <section className="rounded-[14px] bg-ink px-6 py-8 text-white" aria-labelledby="gamme-h">
        <p className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">★ Gamme exclusive PRODES</p>
        <h1 id="gamme-h" className="text-3xl font-bold">PRO-INTENS</h1>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Arguments">
          <li className="rounded-[9px] border border-white/20 p-3"><strong>NF certifié</strong> <span className="text-white/70">collectivités</span></li>
          <li className="rounded-[9px] border border-white/20 p-3"><strong>Chorus Pro</strong> <span className="text-white/70">compatible</span></li>
        </ul>
      </section>
      {families.length > 0 ? (
        <>
          <p className="text-ink-2" data-testid="gamme-count">{families.length} famille{families.length > 1 ? "s" : ""} PRO-INTENS.</p>
          <FamilyGrid prices label="Familles de la gamme PRO-INTENS" families={families.slice(0, 48).map((f) => ({ ...familyCard(f), from: familyPrice(catalog, f, now) }))} />
        </>
      ) : (
        <div className="rounded-[14px] border border-line bg-white p-6" data-testid="gamme-empty">
          <h2 className="text-lg font-semibold">Aucun produit publié</h2>
          <p className="mt-1 text-ink-2">Aucun produit de la gamme n&apos;est publié pour le moment.</p>
          <Link href="/devis" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-medium text-white">Demander un devis sur mesure</Link>
        </div>
      )}
    </div>
  );
}
