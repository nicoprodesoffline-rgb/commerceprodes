import Link from "next/link";
import { CartCount } from "@/components/cart/cart-provider";
import { CategoryMenu, type MenuCategory } from "@/components/layout/category-menu";

/**
 * En-tête : mot-symbole TEXTE (DA §2.2 : logo officiel PENDING_ASSET_VERIFICATION, « pas de faux logo »),
 * menu Catégories, recherche serveur, panier. Le bandeau de démonstration reste court ; le détail technique
 * (publication, séquence, instant) est au pied de page, en second niveau (DA §1.2, revue A2 « bandeau technique »).
 */
export function SiteHeader({ dataLabel, categories }: { dataLabel: string | null; categories: MenuCategory[] }) {
  return (
    <header className="border-b border-line bg-white">
      {dataLabel === "STAGING_FIXTURE" && (
        <p className="bg-surface px-4 py-1.5 text-center text-xs text-ink-2" data-testid="staging-banner">
          Boutique de démonstration — données de test <span className="font-mono">{dataLabel}</span> : les demandes sont enregistrées
          localement et ne sont traitées par personne.
        </p>
      )}
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 lg:px-8">
        <Link href="/" className="inline-flex min-h-[42px] items-center text-xl font-bold tracking-[0.08em] text-ink" aria-label="PRODES — accueil du catalogue">
          PRODES
        </Link>
        <nav aria-label="Navigation principale" className="order-3 flex items-center gap-2 sm:order-none">
          <CategoryMenu categories={categories} />
        </nav>
        <form role="search" action="/recherche" method="get" className="order-4 flex w-full min-w-0 gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-end">
          <label htmlFor="q-header" className="sr-only">
            Rechercher une famille de produits
          </label>
          <input
            id="q-header"
            name="q"
            type="search"
            maxLength={100}
            placeholder="Rechercher (nom de famille)"
            className="h-[42px] min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white px-3 sm:max-w-80"
          />
          <button type="submit" className="h-[42px] shrink-0 rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface">
            Rechercher
          </button>
        </form>
        <Link href="/panier" className="ml-auto inline-flex min-h-[42px] items-center rounded-[9px] px-3 font-medium hover:bg-surface sm:ml-0">
          Panier <CartCount />
        </Link>
      </div>
    </header>
  );
}
