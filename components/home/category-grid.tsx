import Link from "next/link";
import { count } from "@/components/site/format";

export type CategoryTile = { key: string; name: string; familyCount: number; imageSha?: string | null; intro?: string | null; children: { key: string; name: string }[] };

export function CategoryGrid({ categories }: { categories: CategoryTile[] }) {
  if (categories.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-12 gap-y-2">
      {categories.map(c => (
        <li key={c.key} className="min-w-0 max-w-full">
          <Link href={`/categorie/${c.key}`} data-testid="category-tile" className="group flex min-h-11 items-center gap-4 py-3 text-brand [overflow-wrap:anywhere] hover:underline">
              <span><span className="block text-base font-bold">{c.name}</span><span className="block text-xs text-ink-2">{count(c.familyCount)} famille{c.familyCount > 1 ? "s" : ""}</span>{c.intro && <span className="mt-1 block max-w-[48ch] whitespace-pre-line text-xs font-normal text-ink-2" data-testid="category-tile-intro">{c.intro}</span>}</span>
              <span aria-hidden="true" className="text-brand">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
