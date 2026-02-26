import CartModal from "components/cart/modal";
import { getMenu } from "lib/supabase";
import { Menu } from "lib/supabase/types";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import MobileMenu from "./mobile-menu";
import { SearchSkeleton } from "./search";
import { LiveSearch } from "components/search/live-search";

export async function Navbar() {
  const menu = await getMenu("next-js-frontend-header-menu");

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* ── Niveau 1 : Barre supérieure rouge PRODES ── */}
      <div className="bg-[#cc1818] text-white">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-1.5 text-xs lg:px-6">
          {/* Gauche : tel + horaires */}
          <div className="flex items-center gap-4">
            <a href="tel:+33467243034" className="flex items-center gap-1.5 hover:text-red-100 transition-colors">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
              04 67 24 30 34
            </a>
            <span className="hidden sm:inline text-red-200">·</span>
            <span className="hidden sm:inline text-red-100">Lun–Sam 8h30–19h</span>
          </div>

          {/* Centre : message */}
          <span className="hidden md:inline font-medium">
            Livraison gratuite sur toute la gamme
          </span>

          {/* Droite : liens */}
          <div className="flex items-center gap-3">
            <Link href="/faq" className="hover:text-red-100 transition-colors">
              FAQ
            </Link>
            <span className="text-red-300">|</span>
            <Link href="/contact" className="hover:text-red-100 transition-colors">
              Nous contacter
            </Link>
            <span className="text-red-300">|</span>
            <Link href="/search" className="hover:text-red-100 transition-colors">
              Catalogue
            </Link>
          </div>
        </div>
      </div>

      {/* ── Niveau 2 : Header principal blanc ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3 lg:px-6">
          {/* Mobile menu button */}
          <div className="block flex-none md:hidden">
            <Suspense fallback={null}>
              <MobileMenu menu={menu} />
            </Suspense>
          </div>

          {/* Logo */}
          <Link href="/" prefetch={true} aria-label="PRODES — Accueil" className="flex-none">
            <Image
              src="/logo-prodes.png"
              alt="PRODES"
              width={140}
              height={44}
              style={{ objectFit: "contain", height: "44px", width: "auto" }}
              priority
            />
          </Link>

          {/* Search bar — centre avec autocomplete */}
          <div className="flex-1 hidden md:block">
            <Suspense fallback={<SearchSkeleton />}>
              <LiveSearch placeholder="Rechercher un produit, une référence..." />
            </Suspense>
          </div>

          {/* Droite : liens + panier */}
          <div className="flex items-center gap-3 ml-auto md:ml-0">
            <Link
              href="/devis-express"
              className="hidden lg:inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#cc1818] transition-colors"
            >
              Devis express
            </Link>
            <CartModal />
          </div>
        </div>
      </div>

      {/* ── Niveau 3 : Navigation catégories ── */}
      {menu.length > 0 && (
        <nav className="hidden md:block bg-white border-b border-gray-100">
          <div className="mx-auto max-w-screen-2xl px-4 lg:px-6">
            <ul className="flex items-center gap-1 overflow-x-auto">
              {menu.map((item: Menu) => (
                <li key={item.title} className="flex-none">
                  <Link
                    href={item.path}
                    prefetch={true}
                    className="inline-block whitespace-nowrap px-3 py-2.5 text-sm text-gray-700 hover:text-[#cc1818] hover:border-b-2 hover:border-[#cc1818] transition-colors"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </header>
  );
}
