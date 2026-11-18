import Link from "next/link";
import { DEFAULT_SHOP, type ShopSettings } from "@/lib/site-shop/settings";

export function UtilityBar({ shop = DEFAULT_SHOP }: { shop?: ShopSettings }) {
  return (
    <div className="bg-brand text-xs text-white" data-testid="utility-bar">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-4 lg:px-8">
        <p className="shrink-0 font-medium">{shop.openingHours}</p>
        <p className="hidden font-medium xl:block">{shop.deliveryNotice}</p>
        <nav aria-label="Liens utiles" className="flex items-center gap-1 sm:gap-3">
          <Link href="/faq" className="hidden min-h-11 items-center px-1 hover:underline sm:inline-flex">FAQ</Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center px-1 hover:underline">Nous contacter</Link>
          <Link href="/recherche" className="hidden min-h-11 items-center px-1 hover:underline sm:inline-flex">Catalogue</Link>
          <Link href="/favoris" className="hidden min-h-11 items-center px-1 hover:underline md:inline-flex">Ma sélection</Link>
        </nav>
      </div>
    </div>
  );
}
