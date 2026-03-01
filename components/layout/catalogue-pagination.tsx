import Link from "next/link";

interface CataloguePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** Current URL search params (used to build prev/next URLs) */
  searchParams: Record<string, string | undefined>;
  /** Base path, e.g. "/search" or "/search/mobilier-urbain" */
  basePath: string;
}

function buildUrl(
  basePath: string,
  params: Record<string, string | undefined>,
  pageOverride: number,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "" && k !== "page") qs.set(k, v);
  }
  if (pageOverride > 0) qs.set("page", String(pageOverride));
  const qstr = qs.toString();
  return `${basePath}${qstr ? `?${qstr}` : ""}`;
}

export default function CataloguePagination({
  page,
  totalPages,
  total,
  pageSize,
  searchParams,
  basePath,
}: CataloguePaginationProps) {
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  const prevUrl = page > 0 ? buildUrl(basePath, searchParams, page - 1) : null;
  const nextUrl = page < totalPages - 1 ? buildUrl(basePath, searchParams, page + 1) : null;

  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      {/* Counter */}
      <p className="text-sm text-gray-500">
        {from}–{to} sur <strong>{total}</strong> produit{total !== 1 ? "s" : ""}
      </p>

      {/* Prev / page numbers / Next */}
      <nav className="flex items-center gap-2" aria-label="Pagination">
        {prevUrl ? (
          <Link
            href={prevUrl}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Précédent
          </Link>
        ) : (
          <span className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-300">
            ← Précédent
          </span>
        )}

        {/* Page number chips — show max 5 */}
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          // Centered window around current page
          let startPage = Math.max(0, Math.min(page - 2, totalPages - 5));
          const p = startPage + i;
          const isActive = p === page;
          const url = buildUrl(basePath, searchParams, p);
          return (
            <Link
              key={p}
              href={url}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#cc1818] text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {p + 1}
            </Link>
          );
        })}

        {nextUrl ? (
          <Link
            href={nextUrl}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Suivant →
          </Link>
        ) : (
          <span className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-300">
            Suivant →
          </span>
        )}
      </nav>
    </div>
  );
}
