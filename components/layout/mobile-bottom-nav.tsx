"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "components/cart/cart-context";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { cart, openCart } = useCart();
  const count = cart.totalQuantity;

  const tabs = [
    { href: "/", label: "Accueil", icon: "🏠" },
    { href: "/search", label: "Catalogue", icon: "🔍" },
    { href: "/devis-express", label: "Devis", icon: "📋" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white md:hidden">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isActive
                ? "text-[#cc1818] bg-red-50"
                : "text-gray-500 hover:text-gray-800"
            }`}
            aria-label={tab.label}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}

      {/* Panier avec badge */}
      <button
        onClick={openCart}
        className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
        aria-label={`Panier (${count} article${count !== 1 ? "s" : ""})`}
      >
        <span className="relative text-xl leading-none">
          🛒
          {count > 0 && (
            <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#cc1818] text-[10px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
        <span>Panier</span>
      </button>
    </nav>
  );
}
