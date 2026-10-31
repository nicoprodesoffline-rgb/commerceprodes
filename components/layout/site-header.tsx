import Image from "next/image";
import Link from "next/link";
import { CartDrawerButton } from "@/components/cart/cart-drawer";
import { CategoryMenu, type MenuCategory } from "@/components/layout/category-menu";
import { LiveSearch } from "@/components/layout/live-search";
import { UtilityBar } from "@/components/layout/utility-bar";
import { UniverseBar } from "@/components/layout/universe-bar";
import type { PublishedPage } from "@/lib/site-content/pages";

/**
 * En-tête en trois niveaux, comme l'historique (a985aca2) : barre utile, bandeau principal (logo, recherche, devis, panier),
 * navigation par catégories. Le menu « Catégories » (WAI-ARIA disclosure, tous niveaux) reste le menu de tous les écrans, mobile compris :
 * il remplace le tiroir de l'ancien menu mobile. Le détail technique de la publication reste au pied de page (DA §1.2).
 */
export function SiteHeader({ dataLabel, categories, universe = [] }: { dataLabel: string | null; categories: MenuCategory[]; universe?: PublishedPage[] }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white">
      <UtilityBar />
      {dataLabel === "STAGING_FIXTURE" && (
        <p className="bg-surface px-4 py-1.5 text-center text-xs text-ink-2" data-testid="staging-banner">
          Boutique de démonstration — données de test <span className="font-mono">{dataLabel}</span> : les demandes sont enregistrées
          localement et ne sont traitées par personne.
        </p>
      )}
      <div className="border-b border-line">
        <div className="relative mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 lg:px-8">
          <Link href="/" className="inline-flex min-h-[42px] items-center gap-2.5 text-xl font-bold tracking-[0.08em] text-ink" aria-label="PRODES — accueil du catalogue">
            <Image src="/logo-prodes.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" priority />
            <span>PRODES</span>
          </Link>
          <nav aria-label="Navigation principale" className="order-3 flex items-center gap-2 sm:order-none">
            <CategoryMenu categories={categories} />
          </nav>
          <LiveSearch />
          <Link href="/devis" className="hidden min-h-[42px] items-center rounded-[9px] px-3 text-sm text-ink-2 hover:bg-surface hover:text-ink lg:inline-flex">
            Demande de devis
          </Link>
          <CartDrawerButton />
        </div>
      </div>
      <UniverseBar entries={universe} />
      {categories.length > 0 && (
        <nav aria-label="Catégories principales" className="hidden border-b border-line bg-white md:block" data-testid="top-categories">
          <ul className="mx-auto flex max-w-[1280px] items-center gap-1 overflow-x-auto px-4 lg:px-8">
            {categories.map((c) => (
              <li key={c.key} className="flex-none">
                <Link href={`/categorie/${c.key}`} className="inline-flex min-h-[40px] items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm text-ink-2 hover:border-signal hover:text-ink">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
