export type PageKind = "home" | "business" | "seasonal";
export type PublishedPage = { slug: string; title: string; kind: PageKind; order: number };

export interface PagesSource {
  listPublished(): Promise<PublishedPage[]>;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const UNIVERSE_MAX = 8;

export function universeEntries(pages: readonly PublishedPage[]): PublishedPage[] {
  if (!Array.isArray(pages)) return [];
  const seen = new Set<string>();
  const entries: PublishedPage[] = [];
  for (const page of pages) {
    if (
      !page || typeof page !== "object" || Array.isArray(page) ||
      (page.kind !== "business" && page.kind !== "seasonal") ||
      typeof page.slug !== "string" || !SLUG_RE.test(page.slug) ||
      typeof page.title !== "string" ||
      typeof page.order !== "number" || !Number.isFinite(page.order)
    ) continue;
    const title = page.title.trim();
    if (!title || title.length > 60 || seen.has(page.slug)) continue;
    seen.add(page.slug);
    entries.push({ slug: page.slug, title, kind: page.kind, order: page.order });
  }
  return entries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "fr")).slice(0, UNIVERSE_MAX);
}
