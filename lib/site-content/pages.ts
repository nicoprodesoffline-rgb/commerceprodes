export type PublishedPage = { slug: string; title: string };

export interface PagesSource {
  listPublished(): Promise<PublishedPage[]>;
}

export const SLUG_RE = /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/;
export const UNIVERSE_MAX = 8;

export function universeEntries(pages: unknown): PublishedPage[] {
  if (!Array.isArray(pages)) return [];
  const seen = new Set<string>();
  const entries: PublishedPage[] = [];
  for (const page of pages) {
    if (
      !page || typeof page !== "object" || Array.isArray(page) ||
      typeof page.slug !== "string" || page.slug.length > 199 || !SLUG_RE.test(page.slug) || /[\u0000-\u001f\u007f-\u009f]/.test(page.slug) ||
      typeof page.title !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(page.title)
    ) continue;
    const title = page.title.trim();
    if (!title || Array.from(page.title).length > 200 || seen.has(page.slug)) continue;
    seen.add(page.slug);
    entries.push({ slug: page.slug, title });
    if (entries.length === UNIVERSE_MAX) break;
  }
  return entries;
}

/** Next fournit normalement des segments décodés ; une entrée encore encodée est validée après un seul décodage. */
export function editorialSlug(segments: unknown): string | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  try {
    const decoded: string[] = [];
    for (const segment of segments) {
      if (typeof segment !== "string") return null;
      const value = decodeURIComponent(segment);
      if (!/^[a-z0-9_-]+$/.test(value) || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
      decoded.push(value);
    }
    const slug = "/" + decoded.join("/");
    return slug.length <= 200 ? slug : null;
  } catch { return null; }
}
