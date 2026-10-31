"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { editorialSlug } from "@/lib/site-content/pages";
import type { PublishedPage } from "@/lib/site-content/pages";

export function UniverseBar({ entries, currentSlug }: { entries: PublishedPage[]; currentSlug?: string }) {
  const pathname = usePathname();
  const activeSlug = currentSlug ?? (pathname?.startsWith("/p/") ? editorialSlug(pathname.slice(3).split("/"))?.slice(1) : undefined);
  if (entries.length === 0) return null;
  return (
    <nav aria-label="Univers" data-testid="universe-bar" className="min-w-0 w-full border-b border-line bg-white">
      <ul className="mx-auto flex w-full max-w-[1280px] flex-nowrap items-center gap-1 overflow-x-auto px-4 py-1 lg:px-8">
        {entries.map(({ slug, title }) => (
          <li key={slug} className="flex-none">
            <Link
              href={`/p/${slug.split("/").map(encodeURIComponent).join("/")}`}
              aria-current={slug === activeSlug ? "page" : undefined}
              className={`inline-flex min-h-[34px] min-w-[34px] items-center whitespace-nowrap border-b-2 px-3 text-sm text-ink-2 hover:text-ink ${slug === activeSlug ? "border-signal" : "border-transparent"}`}
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
