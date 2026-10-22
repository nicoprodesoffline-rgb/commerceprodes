import Image from "next/image";
import Link from "next/link";
import { CartCount } from "@/components/cart/cart-provider";

export function SiteHeader({ instantUtc, publicationId }: { instantUtc: string; publicationId: string }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900" data-testid="staging-banner">
        STAGING_FIXTURE — catalogue de démonstration ({publicationId}) · devis et commande en SIMULATION · instant{" "}
        <span className="font-mono">{instantUtc}</span>
      </div>
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
