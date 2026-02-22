"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: "📊", exact: true },
  { href: "/admin/devis", label: "Demandes de devis", icon: "📋" },
  { href: "/admin/products", label: "Produits", icon: "📦" },
  { href: "/admin/categories", label: "Catégories", icon: "🗂️" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-gray-800 text-white fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-700">
        <Image
          src="/logo-prodes.png"
          alt="PRODES"
          width={120}
          height={36}
          className="object-contain brightness-0 invert"
        />
        <p className="mt-1 text-xs text-gray-400">Administration</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {navLinks.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-gray-700 text-white border-l-[3px] border-blue-500 pl-[9px]"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              <span className="text-base">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-700 px-2 py-4 space-y-1">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <span>🌐</span>
          Voir le site
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
        >
          <span>🚪</span>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
