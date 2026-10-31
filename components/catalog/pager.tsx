import Link from "next/link";

/** Pagination d'une liste : liens ordinaires qui gardent la recherche, les filtres et le tri (aucun état caché). */
export function Pager({ action, params, page, pages }: { action: string; params: Record<string, string>; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams(params);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `${action}?${s}` : action;
  };
  return (
    <nav aria-label="Pages de résultats" className="flex items-center justify-between gap-3" data-testid="pager">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="inline-flex h-[34px] items-center rounded-[9px] border border-line-strong bg-white px-4 text-sm hover:bg-surface">Page précédente</Link> : <span />}
      <span className="text-sm text-ink-2">Page {page} sur {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="inline-flex h-[34px] items-center rounded-[9px] border border-line-strong bg-white px-4 text-sm hover:bg-surface">Page suivante</Link> : <span />}
    </nav>
  );
}
