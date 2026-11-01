import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CartDrawerButton } from "@/components/cart/cart-drawer";
import { CategoryMenu, type MenuCategory } from "@/components/layout/category-menu";
import { LiveSearch } from "@/components/layout/live-search";
import { UtilityBar } from "@/components/layout/utility-bar";
import { UniverseBar } from "@/components/layout/universe-bar";
import type { PublishedPage } from "@/lib/site-content/pages";

export function SiteHeader({ categories, universe = [] }: { categories: MenuCategory[]; universe?: PublishedPage[] }) {
  return (
    <header className="sticky top-0 z-40 w-full min-w-0 bg-white">
      <UtilityBar />
      <div className="border-b border-line">
        <div className="relative mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 lg:flex-nowrap lg:px-8 lg:py-5">
          <Link href="/" className="inline-flex min-h-12 shrink-0 items-center gap-2.5 text-[28px] font-extrabold tracking-tight text-ink lg:text-[32px]" aria-label="PRODES — accueil du catalogue">
            <Image src="/logo-prodes.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" priority />
            <span>PRODES</span>
          </Link>
          <Suspense fallback={null}><LiveSearch /></Suspense>
          <Link href="/devis" className="hidden min-h-12 shrink-0 items-center px-2 text-sm font-semibold text-ink hover:text-brand lg:inline-flex">
            Demande de devis
          </Link>
          <CartDrawerButton />
        </div>
      </div>
      <nav aria-label="Navigation principale" className="relative border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 lg:px-8">
          <CategoryMenu categories={categories} />
          {categories.length > 0 && (
            <nav aria-label="Catégories principales" className="hidden min-w-0 flex-1 md:block" data-testid="top-categories">
              <ul className="flex min-w-0 items-center overflow-x-auto">
                {categories.map((c) => (
                  <li key={c.key} className="flex-none">
                    <Link href={`/categorie/${c.key}`} className="inline-flex min-h-12 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-2 hover:border-brand hover:text-brand">{c.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <Link href="/devis" className="ml-auto inline-flex min-h-12 items-center text-sm font-semibold text-brand lg:hidden">Demande de devis</Link>
        </div>
      </nav>
      <UniverseBar entries={universe} />
    </header>
  );
}
