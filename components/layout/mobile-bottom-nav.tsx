"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartCount } from "@/components/cart/cart-provider";

/**
 * Barre de navigation basse du mobile (T-T04) : accueil, catalogue, devis, panier. Quatre destinations qui existent ;
 * le panier garde son compteur (lignes du panier de ce navigateur). Masquée dès 768 px et à l'impression.
 */
const TABS = [
  { href: "/", label: "Accueil" },
  { href: "/recherche", label: "Catalogue" },
  { href: "/devis", label: "Devis" },
  { href: "/panier", label: "Panier" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation du bas" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white md:hidden print:hidden" data-testid="bottom-nav">
      <ul className="flex">
        {TABS.map((t) => {
          const current = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-[56px] items-center justify-center gap-1 px-1 text-xs font-medium ${current ? "border-t-2 border-signal bg-signal-subtle text-signal" : "border-t-2 border-transparent text-ink-2"}`}
              >
                {t.label}
                {t.href === "/panier" && <CartCount />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
