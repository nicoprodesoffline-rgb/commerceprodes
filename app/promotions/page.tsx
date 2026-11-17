import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { mirrorSections, promoFamilies } from "@/lib/site-catalog/merchandising";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promotions" };

/** Univers « Promotions » (M04) : les rubriques du catalogue, chacune ne montrant que ses familles en promotion. Aucune date de fin n'est montrée (M05). Sans promotion : introuvable, comme son entrée de menu (M07). */
export default async function PromotionsPage() {
  const catalog = await catalogForPage();
  const now = serverNowUtc();
  const promos = promoFamilies(catalog.families, now);
  if (promos.length === 0) notFound();
  const nav = navigationOf(catalog);
  const sections = mirrorSections(nav.menu, promos, (key) => nav.anchor(key));
  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Promotions" }]} />
      <h1 className="text-2xl font-semibold">Promotions</h1>
      {sections.map((s) => (
        <section key={s.key} aria-labelledby={`promo-${s.key}`} data-testid="promo-section" className="space-y-4">
          <h2 id={`promo-${s.key}`} className="text-xl font-semibold"><Link href={`/categorie/${s.key}`} className="hover:text-brand">{s.name}</Link></h2>
          <FamilyGrid prices label={`Promotions : ${s.name}`} families={s.families.map((f) => ({ ...familyCard(f), from: familyPrice(catalog, f, now), promo: true }))} />
        </section>
      ))}
    </div>
  );
}
