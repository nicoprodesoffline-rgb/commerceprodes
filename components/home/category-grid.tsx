import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";

export type CategoryTile = { key: string; name: string; familyCount: number; imageSha?: string | null; children: { key: string; name: string }[] };

export function CategoryGrid({ categories }: { categories: CategoryTile[] }) {
  if (categories.length === 0) return null;
  return (
    <ul className="commerce-grid">
      {categories.map(c => (
        <li key={c.key} className="min-w-0">
          <Link href={`/categorie/${c.key}`} data-testid="category-tile" className="group block overflow-hidden rounded-sm border border-line bg-white hover:border-brand">
            <MediaImage sha256={c.imageSha ?? null} alt="" className="aspect-[3/2] w-full p-4" />
            <span className="flex min-h-16 items-center justify-between gap-3 border-t border-line px-4 py-3 [overflow-wrap:anywhere]">
              <span><span className="block text-base font-bold text-ink group-hover:text-brand">{c.name}</span><span className="block text-xs text-ink-2">{c.familyCount} famille{c.familyCount > 1 ? "s" : ""}</span></span>
              <span aria-hidden="true" className="text-brand">→</span>
            </span>
          </Link>
          {c.children.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-x-4" aria-label={`Sous-catégories de ${c.name}`}>
              {c.children.slice(0, 3).map(s => <li key={s.key} className="min-w-0 max-w-full"><Link href={`/categorie/${s.key}`} className="inline-flex min-h-11 max-w-full items-center text-sm text-ink-2 underline-offset-4 [overflow-wrap:anywhere] hover:text-brand hover:underline">{s.name}</Link></li>)}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
