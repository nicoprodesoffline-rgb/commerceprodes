import Link from "next/link";
import type { PublishedPage } from "@/lib/site-content/pages";

export function UniverseBar({ entries, currentSlug }: { entries: PublishedPage[]; currentSlug?: string }) {
  if (entries.length === 0) return null;
  return (
    <nav aria-label="Univers" data-testid="universe-bar" className="min-w-0 w-full border-b border-line bg-white">
      <ul className="mx-auto flex w-full max-w-[1280px] flex-nowrap items-center gap-1 overflow-x-auto px-4 py-1 lg:px-8">
        {entries.map(({ slug, title }) => (
          <li key={slug} className="flex-none">
            <Link
              href={`/p/${slug}`}
              aria-current={slug === currentSlug ? "page" : undefined}
              className={`inline-flex min-h-[34px] min-w-[34px] items-center whitespace-nowrap border-b-2 px-3 text-sm text-ink-2 hover:text-ink ${slug === currentSlug ? "border-signal" : "border-transparent"}`}
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
