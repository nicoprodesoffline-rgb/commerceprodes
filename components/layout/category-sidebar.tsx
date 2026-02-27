"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CategoryWithCount } from "lib/supabase/types";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 flex-none text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function CategorySidebar({
  categories,
}: {
  categories: CategoryWithCount[];
}) {
  const pathname = usePathname();

  // Pre-open the accordion if a child is active
  const initialOpen = new Set<string>(
    categories
      .filter((cat) =>
        cat.children?.some((child) => pathname === `/search/${child.slug}`),
      )
      .map((cat) => cat.id),
  );
  const [openCategories, setOpenCategories] = useState<Set<string>>(initialOpen);

  const toggle = (id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <nav aria-label="Catégories">
      <h3 className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-gray-500 md:block">
        Catégories
      </h3>

      {/* Desktop: vertical list with accordion */}
      <ul className="hidden md:flex md:flex-col md:gap-0.5">
        {/* Tout le catalogue */}
        <li>
          <Link
            href="/search"
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === "/search"
                ? "bg-red-50 font-semibold text-[#cc1818]"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Tout le catalogue
          </Link>
        </li>

        {categories.map((cat) => {
          const catPath = `/search/${cat.slug}`;
          const isActive = pathname === catPath;
          const hasChildren = cat.children && cat.children.length > 0;
          const isOpen = openCategories.has(cat.id);

          return (
            <li key={cat.id}>
              {hasChildren ? (
                <>
                  {/* Header cliquable */}
                  <button
                    onClick={() => toggle(cat.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-red-50 font-semibold text-[#cc1818]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-start gap-1.5 min-w-0">
                      <span className="text-left leading-snug">{cat.name}</span>
                      {cat.product_count > 0 && (
                        <span className="ml-1 text-xs text-gray-400 flex-none">
                          ({cat.product_count})
                        </span>
                      )}
                    </span>
                    <ChevronIcon open={isOpen} />
                  </button>

                  {/* Sous-catégories */}
                  {isOpen && (
                    <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
                      {/* Lien vers la catégorie parente */}
                      <li>
                        <Link
                          href={catPath}
                          className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "font-medium text-[#cc1818]"
                              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                          }`}
                        >
                          Tout — {cat.name}
                        </Link>
                      </li>
                      {cat.children!.map((child) => {
                        const childPath = `/search/${child.slug}`;
                        const childActive = pathname === childPath;
                        return (
                          <li key={child.id}>
                            <Link
                              href={childPath}
                              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                                childActive
                                  ? "font-medium text-[#cc1818] bg-red-50"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              }`}
                            >
                              <span className="truncate">{child.name}</span>
                              {child.product_count > 0 && (
                                <span className="ml-1 text-xs text-gray-400 flex-none">
                                  ({child.product_count})
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <Link
                  href={catPath}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-red-50 font-semibold text-[#cc1818]"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-left leading-snug">{cat.name}</span>
                  {cat.product_count > 0 && (
                    <span className="ml-1 text-xs text-gray-400 flex-none">
                      ({cat.product_count})
                    </span>
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* Mobile: horizontal scroll chips */}
      <div className="md:hidden overflow-x-auto">
        <ul className="flex gap-2 pb-2">
          <li>
            <Link
              href="/search"
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === "/search"
                  ? "bg-[#cc1818] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Tout
            </Link>
          </li>
          {categories.map((cat) => {
            const catPath = `/search/${cat.slug}`;
            const active =
              pathname === catPath ||
              cat.children?.some((c) => pathname === `/search/${c.slug}`);
            return (
              <li key={cat.id}>
                <Link
                  href={catPath}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-[#cc1818] text-white" : "bg-gray-100 text-gray-700"
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
