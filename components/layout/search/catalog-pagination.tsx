import Link from "next/link";
import { buildCatalogPageUrl, SearchPageParams } from "lib/search-pagination";

export default function CatalogPagination({
  pathname,
  searchParams,
  currentPage,
  totalPages,
  totalItems,
}: {
  pathname: string;
  searchParams: SearchPageParams;
  currentPage: number;
  totalPages: number;
  totalItems: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination catalogue"
      className="mt-8 flex flex-wrap items-center gap-2"
    >
      {currentPage > 1 ? (
        <Link
          href={buildCatalogPageUrl(pathname, searchParams, currentPage - 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
        >
          ← Précédent
        </Link>
      ) : null}

      <span className="text-sm text-gray-500">
        Page {currentPage} / {totalPages} ({totalItems} produits)
      </span>

      {currentPage < totalPages ? (
        <Link
          href={buildCatalogPageUrl(pathname, searchParams, currentPage + 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
        >
          Suivant →
        </Link>
      ) : null}
    </nav>
  );
}
