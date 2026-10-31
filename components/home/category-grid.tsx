import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";

export type CategoryTile = { key: string; name: string; familyCount: number; imageSha?: string | null; children: { key: string; name: string }[] };

/** Catégories racines du DTO et leurs sous-catégories (ordre du DTO). */
export function CategoryGrid({ categories }: { categories: CategoryTile[] }) {
  if (categories.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((c) => (
        <li key={c.key} className="min-w-0">
          <Link href={`/categorie/${c.key}`} data-testid="category-tile" className="group relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-surface focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
            {c.imageSha ? (
              <MediaImage sha256={c.imageSha} alt="" className="absolute inset-0 h-full w-full object-cover! transition-transform motion-safe:group-hover:scale-105 motion-safe:group-focus-visible:scale-105" />
            ) : (
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-6xl text-ink-3">
                {c.name.charAt(0).toLocaleUpperCase("fr")}
              </span>
            )}
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-3 [overflow-wrap:anywhere] sm:p-4">
              <span className="block text-base font-semibold text-white">{c.name}</span>
              <span className="block text-xs text-white/80">{c.familyCount} famille{c.familyCount > 1 ? "s" : ""}</span>
            </span>
          </Link>
          {c.children.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Sous-catégories de ${c.name}`}>
              {c.children.slice(0, 3).map((s) => (
                <li key={s.key} className="min-w-0 max-w-full">
                  <Link href={`/categorie/${s.key}`} className="inline-flex min-h-[34px] max-w-full items-center text-sm text-ink-2 underline-offset-2 [overflow-wrap:anywhere] hover:underline">
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
