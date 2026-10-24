import Link from "next/link";

export type CategoryTile = { key: string; name: string; familyCount: number; children: { key: string; name: string }[] };

/** Catégories racines du DTO et leurs sous-catégories (ordre du DTO). */
export function CategoryGrid({ categories }: { categories: CategoryTile[] }) {
  if (categories.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <li key={c.key} className="rounded-[14px] border border-line bg-white p-4">
          <Link href={`/categorie/${c.key}`} className="inline-flex min-h-[34px] items-center font-semibold hover:underline">
            {c.name}
          </Link>
          <p className="text-xs text-ink-3">{c.familyCount === 0 ? "Aucune famille classée directement" : `${c.familyCount} famille${c.familyCount > 1 ? "s" : ""}`}</p>
          {c.children.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Sous-catégories de ${c.name}`}>
              {c.children.map((s) => (
                <li key={s.key}>
                  <Link href={`/categorie/${s.key}`} className="inline-flex min-h-[34px] items-center rounded-full border border-line-strong px-3 text-sm hover:bg-surface">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
