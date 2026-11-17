/**
 * Référencement du SITE (cercle 3, ligne 3.19 ; attendus S09–S12). Fonctions pures, sans I/O : la page lit la génération servie
 * et l'environnement, puis appelle ces fonctions.
 *
 * Fermeture aux moteurs : réglage `SITE_SEARCH_ENGINES` du serveur, « closed » par défaut ; seule la valeur exacte « open » ouvre.
 * Ouvrir ne demande aucun changement de code (S10) ; l'ouverture reste une décision de l'Owner.
 */

/** L'environnement du serveur : `SITE_SEARCH_ENGINES` et `SITE_PUBLIC_ORIGIN` sont les seules clés lues. */
export type SeoEnv = Readonly<Record<string, string | undefined>>;

/** Adresses que les moteurs ne doivent jamais parcourir, même ouverts : achat, comptes, listes personnelles, API. */
export const PRIVATE_PATHS = ["/panier", "/commande", "/recu", "/favoris", "/comparer", "/devis", "/api/"];

export function searchEnginesOpen(env: SeoEnv): boolean {
  return env.SITE_SEARCH_ENGINES === "open";
}

/** L'origine publique déclarée (`https://exemple.fr`), ou null : jamais d'adresse canonique inventée. */
export function publicOrigin(value: string | undefined): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Avertissement de démarrage (décision du 17/11) : sans origine publique valide, le plan du site reste vide et il n'y a ni canonique ni adresse dans les données structurées ; jamais une adresse inventée. `null` si tout va bien. */
export function originWarning(value: string | undefined): string | null {
  if (publicOrigin(value) !== null) return null;
  const state = value === undefined || value === "" ? "absent" : "invalide";
  return `SITE_PUBLIC_ORIGIN ${state} : plan du site, canonique et données structurées désactivés`;
}

export function absolute(origin: string | null, path: string): string | null {
  return origin === null ? null : origin + path;
}

export function familyPath(slug: string): string {
  return `/famille/${encodeURIComponent(slug)}`;
}

export function categoryPath(key: string): string {
  return `/categorie/${encodeURIComponent(key)}`;
}

export function editorialPath(slug: string): string {
  return slug === "/" ? "/" : `/p/${slug.slice(1).split("/").map(encodeURIComponent).join("/")}`;
}

/** Directives des balises robots de toutes les pages : fermé = jamais indexé ni suivi. */
export function robotsDirective(env: SeoEnv): { index: boolean; follow: boolean } {
  return searchEnginesOpen(env) ? { index: true, follow: true } : { index: false, follow: false };
}

export type RobotsFile = { rules: { userAgent: string; allow?: string; disallow: string | string[] }; sitemap?: string };

/** `robots.txt` : fermé, tout est interdit ; ouvert, tout sauf les adresses privées, avec le plan du site. */
export function robotsFile(env: SeoEnv): RobotsFile {
  if (!searchEnginesOpen(env)) return { rules: { userAgent: "*", disallow: "/" } };
  const origin = publicOrigin(env.SITE_PUBLIC_ORIGIN);
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}

type SitemapCategory = { category_key: string; parent_category_key: string | null; hidden?: boolean };
type SitemapFamily = { slug: string; primary_category_key: string; secondary_category_keys: string[] };
type SitemapPage = { slug: string };

/** Catégories qui portent au moins une famille, directement ou dans leur sous-arbre (une rubrique vide n'est jamais indexable). */
export function nonEmptyCategories(categories: readonly SitemapCategory[], families: readonly SitemapFamily[]): Set<string> {
  const parent = new Map(categories.map((c) => [c.category_key, c.parent_category_key]));
  const filled = new Set<string>();
  for (const family of families) {
    for (const start of [family.primary_category_key, ...family.secondary_category_keys]) {
      const seen = new Set<string>();
      let key: string | null | undefined = start;
      while (key && parent.has(key) && !seen.has(key)) {
        filled.add(key);
        seen.add(key);
        key = parent.get(key);
      }
    }
  }
  return filled;
}

/**
 * Plan du site (S09) : l'accueil, les rubriques non vides et non masquées, les familles publiées et les pages publiées. Jamais le
 * panier ni une adresse privée. Sans origine publique déclarée : aucune adresse (pas d'adresse absolue inventée).
 */
export function sitemapUrls(origin: string | null, categories: readonly SitemapCategory[], families: readonly SitemapFamily[], pages: readonly SitemapPage[]): string[] {
  if (origin === null) return [];
  const filled = nonEmptyCategories(categories, families);
  const paths = new Set<string>(["/"]);
  for (const category of categories) if (filled.has(category.category_key) && category.hidden !== true) paths.add(categoryPath(category.category_key));
  for (const family of families) paths.add(familyPath(family.slug));
  for (const page of pages) paths.add(editorialPath(page.slug));
  return [...paths].filter((path) => !PRIVATE_PATHS.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))).map((path) => origin + path);
}

export type Crumb = { label: string; href?: string };

/** Données structurées d'une fiche (S11) : Produit (nom, image, prix HT de la première tranche, devise) et fil d'Ariane. */
export function productJsonLd(input: { origin: string | null; name: string; slug: string; description: string; imageSha256: string | null; price: string | null; taxBasis: string | null; crumbs: Crumb[] }): object[] {
  const url = absolute(input.origin, familyPath(input.slug));
  const product: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Product", name: input.name, description: input.description };
  if (url) product.url = url;
  if (input.imageSha256) product.image = absolute(input.origin, `/media/${input.imageSha256}`) ?? `/media/${input.imageSha256}`;
  if (input.price) {
    product.offers = {
      "@type": "Offer", price: input.price, priceCurrency: "EUR", ...(url ? { url } : {}),
      // « Hors taxes » seulement quand la génération le dit ; une base non qualifiée n'est jamais déclarée HT.
      ...(input.taxBasis === "HT" ? { priceSpecification: { "@type": "UnitPriceSpecification", price: input.price, priceCurrency: "EUR", valueAddedTaxIncluded: false } } : {}),
    };
  }
  return [product, breadcrumbJsonLd(input.origin, input.crumbs)];
}

export function breadcrumbJsonLd(origin: string | null, crumbs: Crumb[]): object {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.label, ...(crumb.href ? { item: absolute(origin, crumb.href) ?? crumb.href } : {}) })),
  };
}

export type ShopFacts = { phone?: string | null; email?: string | null; address?: string | null };

/** Accueil (S12) : Organisation (coordonnées tirées des réglages de la boutique) et Recherche du site. */
export function homeJsonLd(origin: string | null, shop: ShopFacts | null): object[] {
  const organization: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Organization", name: "PRODES" };
  if (origin) organization.url = origin + "/";
  if (shop?.phone) organization.telephone = shop.phone;
  if (shop?.email) organization.email = shop.email;
  if (shop?.address) organization.address = shop.address;
  const website: Record<string, unknown> = { "@context": "https://schema.org", "@type": "WebSite", name: "PRODES" };
  if (origin) {
    website.url = origin + "/";
    website.potentialAction = { "@type": "SearchAction", target: `${origin}/recherche?q={search_term_string}`, "query-input": "required name=search_term_string" };
  }
  return [organization, website];
}

/** Contenu d'une balise `<script type="application/ld+json">` : jamais de `</script>` ni de `<` brut dans le texte servi. */
export function jsonLdText(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** 3.18 : la famille dont `slug` est une ancienne adresse (`slug_aliases` du catalogue v2), ou null. */
export function familyByOldAddress<F extends { slug: string }>(families: readonly F[], slug: string): F | null {
  return families.find((family) => ((family as F & { slug_aliases?: readonly string[] }).slug_aliases ?? []).includes(slug)) ?? null;
}
