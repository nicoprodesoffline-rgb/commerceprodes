import CartModal from "components/cart/modal";
import { getMenu } from "lib/supabase";
import { Menu } from "lib/supabase/types";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import MobileMenu from "./mobile-menu";
import Search, { SearchSkeleton } from "./search";

export async function Navbar() {
  const menu = await getMenu("next-js-frontend-header-menu");

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black">
      <div className="mx-auto flex max-w-(--breakpoint-2xl) items-center justify-between px-4 py-3 lg:px-6">
        {/* Mobile menu button */}
        <div className="block flex-none md:hidden">
          <Suspense fallback={null}>
            <MobileMenu menu={menu} />
          </Suspense>
        </div>

        {/* Logo */}
        <div className="flex items-center">
          <Link href="/" prefetch={true} aria-label="PRODES — Accueil">
            <Image
              src="/logo-prodes.png"
              alt="PRODES"
              width={120}
              height={40}
              style={{ objectFit: "contain", height: "40px", width: "auto" }}
              priority
            />
          </Link>
        </div>

        {/* Desktop nav links */}
        {menu.length ? (
          <ul className="hidden gap-5 text-sm md:flex md:items-center lg:gap-6">
            {menu.map((item: Menu) => (
              <li key={item.title}>
                <Link
                  href={item.path}
                  prefetch={true}
                  className="whitespace-nowrap text-neutral-600 underline-offset-4 hover:text-blue-600 hover:underline dark:text-neutral-300 dark:hover:text-white"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Search + Cart */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <Suspense fallback={<SearchSkeleton />}>
              <Search />
            </Suspense>
          </div>
          <CartModal />
        </div>
      </div>
    </nav>
  );
}
