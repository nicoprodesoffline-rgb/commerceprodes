import Link from "next/link";
import type { NavNode } from "@/lib/site-catalog/navigation";

/**
 * Colonne des catégories (V-E03-04/05/06) : « Tout le catalogue », chaque racine avec son nombre de familles, sous-catégories en accordéon natif
 * (`<details>`, sans script) ; sur mobile, une rangée de pastilles défilantes. Catégories et ordre = ceux du DTO.
 */
export function CategorySidebar({ roots, current }: { roots: NavNode[]; current?: string | undefined }) {
  if (roots.length === 0) return null;
  const inside = (n: NavNode, key: string): boolean => n.key === key || n.children.some((c) => inside(c, key));
  return (
    <>
      <nav aria-label="Catégories (pastilles)" className="-mx-4 overflow-x-auto px-4 lg:hidden" data-testid="category-pills">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          <li><Link href="/recherche" className={`inline-flex min-h-[34px] items-center rounded-full border px-3 text-sm ${current === undefined ? "border-ink bg-ink text-white" : "border-line-strong bg-white hover:bg-surface"}`}>Tout</Link></li>
          {roots.map((r) => (
            <li key={r.key}><Link href={`/categorie/${r.key}`} aria-current={current !== undefined && inside(r, current) ? "true" : undefined} className={`inline-flex min-h-[34px] items-center rounded-full border px-3 text-sm ${current !== undefined && inside(r, current) ? "border-ink bg-ink text-white" : "border-line-strong bg-white hover:bg-surface"}`}>{r.name}</Link></li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Catégories" className="hidden w-60 shrink-0 lg:block" data-testid="category-sidebar">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">Catégories</h2>
        <ul className="space-y-1">
          <li><Link href="/recherche" className={`flex min-h-[34px] items-center rounded-[9px] px-2 text-sm hover:bg-surface ${current === undefined ? "font-semibold" : ""}`}>Tout le catalogue</Link></li>
          {roots.map((r) => (
            <li key={r.key}>
              {r.children.length === 0 ? (
                <Link href={`/categorie/${r.key}`} className="flex min-h-[34px] items-center justify-between rounded-[9px] px-2 text-sm hover:bg-surface">
                  <span className={current === r.key ? "font-semibold" : ""}>{r.name}</span><span className="tabular text-xs text-ink-3">{r.subtreeFamilyCount}</span>
                </Link>
              ) : (
                <details open={current !== undefined && inside(r, current)}>
                  <summary className="flex min-h-[34px] cursor-pointer items-center justify-between rounded-[9px] px-2 text-sm hover:bg-surface"><span>{r.name}</span><span className="tabular text-xs text-ink-3">{r.subtreeFamilyCount}</span></summary>
                  <ul className="ml-2 border-l border-line pl-2">
                    <li><Link href={`/categorie/${r.key}`} className={`flex min-h-[34px] items-center rounded-[9px] px-2 text-sm hover:bg-surface ${current === r.key ? "font-semibold" : ""}`}>Tout — {r.name}</Link></li>
                    {r.children.map((c) => (
                      <li key={c.key}><Link href={`/categorie/${c.key}`} className="flex min-h-[34px] items-center justify-between rounded-[9px] px-2 text-sm hover:bg-surface"><span className={current === c.key ? "font-semibold" : ""}>{c.name}</span><span className="tabular text-xs text-ink-3">{c.subtreeFamilyCount}</span></Link></li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
