import Image from "next/image";
import Link from "next/link";
import { CartCount } from "@/components/cart/cart-provider";
import type { CatalogMeta } from "@/lib/site-catalog/catalog";

export function SiteHeader({ meta, instantUtc, forcedNow }: { meta: CatalogMeta | null; instantUtc: string; forcedNow: boolean }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      {meta ? (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900" data-testid="staging-banner">
          {meta.data_label} — catalogue {meta.publication_id} · séquence{" "}
          <span data-testid="catalogue-sequence">{meta.catalogue_sequence}</span> · source {meta.source} · devis et commande validés
          SANS enregistrement · instant {forcedNow ? "figé " : ""}
          <span className="font-mono">{instantUtc}</span>
        </div>
      ) : (
        <div className="bg-red-100 px-4 py-1.5 text-center text-xs text-red-900" data-testid="unavailable-banner">
          CATALOGUE INDISPONIBLE — aucune génération servable
        </div>
      )}
      <nav aria-label="Navigation principale" className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <Link href="/" aria-label="PRODES — Accueil">
          <Image src="/logo-prodes.png" alt="PRODES" width={130} height={44} style={{ height: "40px", width: "auto" }} priority />
        </Link>
        <div className="flex items-center gap-5 text-sm font-medium text-gray-700">
          <Link href="/#categories" className="hover:text-[#cc1818]">Catégories</Link>
          <Link href="/#familles" className="hover:text-[#cc1818]">Familles</Link>
          <Link href="/panier" className="flex items-center hover:text-[#cc1818]">
            Panier <CartCount />
          </Link>
        </div>
      </nav>
    </header>
  );
}
