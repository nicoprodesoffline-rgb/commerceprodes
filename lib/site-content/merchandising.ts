import type { EditorialSet } from "./model";

/** Clés à résoudre dans le catalogue actif, sans transporter de prix. */
export function relatedFamilies(set: EditorialSet | null, familyKey: string, catalogKeys: ReadonlySet<string>): { complementary: string[]; upsell: string[] } {
  const complementary: string[] = [];
  const upsell: string[] = [];
  if (!set || !catalogKeys.has(familyKey)) return { complementary, upsell };
  const seen = new Set<string>([familyKey]);
  for (const kind of ["LIE", "COMPLEMENTAIRE", "UPSELL"] as const) {
    const rows = set.merchandising.filter(row => row.source === familyKey && row.kind === kind).sort((a, b) => a.order - b.order);
    for (const row of rows) {
      if (!catalogKeys.has(row.target) || seen.has(row.target)) continue;
      seen.add(row.target);
      (kind === "UPSELL" ? upsell : complementary).push(row.target);
    }
  }
  return { complementary, upsell };
}
