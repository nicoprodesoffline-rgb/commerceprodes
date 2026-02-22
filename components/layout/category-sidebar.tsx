"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryWithCount } from "lib/supabase/types";

export default function CategorySidebar({
  categories,
}: {
  categories: CategoryWithCount[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Catégories">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden md:block">
        Catégories
      </h3>

      {/* Desktop: vertical list */}
      <ul className="hidden md:flex md:flex-col md:gap-0.5">
        <li>
          <Link
            href="/search"
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === "/search"
                ? "bg-blue-50 font-semibold text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Tout le catalogue
          </Link>
        </li>
        {categories.map((cat) => {
          const catPath = `/search/${cat.slug}`;
          const active = pathname === catPath;
          return (
            <li key={cat.id}>
              <Link
                href={catPath}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {cat.name}
                {cat.product_count > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    ({cat.product_count})
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Mobile: horizontal scroll */}
      <div className="md:hidden overflow-x-auto">
        <ul className="flex gap-2 pb-2">
          <li>
            <Link
              href="/search"
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === "/search"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Tout
            </Link>
          </li>
          {categories.map((cat) => {
            const catPath = `/search/${cat.slug}`;
            const active = pathname === catPath;
            return (
              <li key={cat.id}>
                <Link
                  href={catPath}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {cat.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
