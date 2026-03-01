import { normalize, getSynonymGroup } from "./synonyms";

export type SearchReason = "exact" | "sku" | "synonym" | "fuzzy" | "contains";

export interface SearchCandidate {
  id: string;
  title: string;
  handle: string;
  sku: string | null;
  featuredImageUrl: string | null;
  regularPrice: number | null;
}

export interface ScoredResult extends SearchCandidate {
  score: number;
  reason: SearchReason;
}

/**
 * Score un candidat produit par rapport à une requête normalisée.
 * Retourne null si aucune correspondance détectée.
 */
export function scoreCandidate(
  candidate: SearchCandidate,
  query: string,
): ScoredResult | null {
  const qNorm = normalize(query);
  const titleNorm = normalize(candidate.title);
  const skuLower = (candidate.sku ?? "").toLowerCase();

  // 1. Exact SKU match
  if (skuLower && (skuLower === qNorm || skuLower.includes(qNorm) || qNorm.includes(skuLower))) {
    return { ...candidate, score: 100, reason: "sku" };
  }

  // 2. Exact title match
  if (titleNorm === qNorm) {
    return { ...candidate, score: 95, reason: "exact" };
  }

  // 3. Title starts with query
  if (titleNorm.startsWith(qNorm)) {
    return { ...candidate, score: 88, reason: "exact" };
  }

  // 4. All query words present in title
  const words = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length > 1 && words.every((w) => titleNorm.includes(w))) {
    return { ...candidate, score: 80, reason: "exact" };
  }

  // 5. Title contains full query as substring
  if (titleNorm.includes(qNorm)) {
    return { ...candidate, score: 70, reason: "contains" };
  }

  // 6. Synonym group match
  const synGroup = getSynonymGroup(query);
  if (synGroup.length > 1) {
    for (const syn of synGroup) {
      const synNorm = normalize(syn);
      if (synNorm !== qNorm) {
        if (titleNorm.includes(synNorm) || titleNorm.startsWith(synNorm)) {
          return { ...candidate, score: 60, reason: "synonym" };
        }
        // Check if any synonym word appears in title
        const synWords = synNorm.split(/\s+/).filter((w) => w.length >= 3);
        if (synWords.length > 0 && synWords.every((w) => titleNorm.includes(w))) {
          return { ...candidate, score: 55, reason: "synonym" };
        }
      }
    }
  }

  // 7. Fuzzy: any significant word of query matches
  const sigWords = words.filter((w) => w.length >= 3);
  if (sigWords.length > 0 && sigWords.some((w) => titleNorm.includes(w))) {
    return { ...candidate, score: 40, reason: "fuzzy" };
  }

  return null;
}

/**
 * Trie et filtre une liste de candidats en appliquant le scoring.
 * Retourne uniquement les résultats avec score > 0, triés par score desc.
 */
export function rankResults(
  candidates: SearchCandidate[],
  query: string,
): ScoredResult[] {
  const scored: ScoredResult[] = [];
  for (const c of candidates) {
    const result = scoreCandidate(c, query);
    if (result) scored.push(result);
  }
  // Tri par score décroissant, puis alphabétique en cas d'égalité
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "fr"));
  return scored;
}
