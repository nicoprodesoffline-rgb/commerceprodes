// SEO scoring — 5 criteria, 20 points each, total 0–100

export interface SeoProduct {
  id: string;
  title: string;
  slug: string;
  short_description?: string | null;
  featured_image_url?: string | null;
  sku?: string | null;
  has_category?: boolean;
}

export interface SeoScore {
  score: number;
  suggestions: string[];
}

export function computeSeoScore(p: SeoProduct): SeoScore {
  const suggestions: string[] = [];
  let score = 0;

  // 1. Title length 30–70
  if (p.title && p.title.length >= 30 && p.title.length <= 70) {
    score += 20;
  } else {
    suggestions.push(
      p.title.length < 30
        ? `Titre trop court (${p.title.length} car.) — 30 min`
        : `Titre trop long (${p.title.length} car.) — 70 max`,
    );
  }

  // 2. Short description 80–300
  const descLen = (p.short_description ?? "").replace(/<[^>]*>/g, "").length;
  if (descLen >= 80 && descLen <= 300) {
    score += 20;
  } else {
    suggestions.push(
      descLen === 0
        ? "Description courte manquante"
        : descLen < 80
          ? `Description trop courte (${descLen} car.) — 80 min`
          : `Description trop longue (${descLen} car.) — 300 max`,
    );
  }

  // 3. Image définie et non-placeholder
  if (
    p.featured_image_url &&
    p.featured_image_url.length > 0 &&
    !p.featured_image_url.includes("placeholder")
  ) {
    score += 20;
  } else {
    suggestions.push("Image principale manquante");
  }

  // 4. SKU défini et non vide
  if (p.sku && p.sku.trim().length > 0) {
    score += 20;
  } else {
    suggestions.push("SKU manquant");
  }

  // 5. Au moins une catégorie
  if (p.has_category) {
    score += 20;
  } else {
    suggestions.push("Aucune catégorie assignée");
  }

  return { score, suggestions };
}

export function seoVoyantColor(score: number): string {
  if (score >= 90) return "#16a34a"; // green
  if (score >= 70) return "#ca8a04"; // yellow
  if (score >= 40) return "#d97706"; // orange
  return "#dc2626"; // red
}
