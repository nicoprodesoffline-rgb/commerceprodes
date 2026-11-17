import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { familyCard } from "@/components/site/catalog-views";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { isPromoNow, novelFamilies } from "@/lib/site-catalog/merchandising";
import { catalogForPage } from "@/lib/site-catalog/page";
import { getShopSettings } from "@/lib/site-shop/source";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveautés" };

/** « Nouveautés » (N04–N06) : au plus N familles arrivées sur le SITE depuis moins de D jours (réglages SITE › Boutique), les dernières arrivées d'abord. Aucune : introuvable, comme son entrée de menu. */
export default async function NoveltiesPage() {
  const catalog = await catalogForPage();
  const shop = await getShopSettings();
  const now = serverNowUtc();
  const families = novelFamilies(catalog.families, now, shop.noveltyDays, shop.noveltyCount);
  if (families.length === 0) notFound();
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Nouveautés" }]} />
      <h1 className="text-2xl font-semibold">Nouveautés</h1>
      <FamilyGrid prices label="Nouveautés" families={families.map((f) => ({ ...familyCard(f), from: familyPrice(catalog, f, now), promo: isPromoNow(f, now) }))} />
    </div>
  );
}
