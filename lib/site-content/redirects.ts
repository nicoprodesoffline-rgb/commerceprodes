// Cercle 3 (3.17, 3.18, 3.31) — les redirections des anciennes adresses, appliquées à la requête. Fonction PURE sur le document de contenus ACTIFS
// (déjà vérifié à sa réception et relu à l'identique en base) : jamais sur un aperçu, jamais sur un document non vérifié.
import { redirectsFromV2 } from "./v2";

type Obj = Record<string, any>;

/** Pages propres du SITE : une adresse qui en est une n'est jamais redirigée (le document refuse déjà une redirection depuis une page éditoriale). */
const REAL_EXACT = new Set(["/", "/panier", "/recherche", "/devis", "/commande", "/favoris", "/comparer", "/gamme-pro-intens", "/sitemap.xml", "/robots.txt", "/livraison"]);
/** Routes qui ne sont pas des pages publiques : machine, aperçu, ressources Next. */
const NEVER_PREFIXES = ["/api/", "/apercu/", "/_next/"];

/** Chemin LOCAL seulement : ni `//hôte`, ni `\`, ni caractère de contrôle (redirection ouverte). */
export function isLocalTarget(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  if (value[0] !== "/" || value[1] === "/" || value[1] === "\\") return false;
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%5c/i.test(value) || /%2f%2f/i.test(value)) return false;
  return true;
}

export interface Redirect { to: string; status: 301 | 308 }

let memo: { sha: unknown; map: Map<string, Redirect>; pages: Set<string> } | null = null;

function indexOf(doc: Obj): { map: Map<string, Redirect>; pages: Set<string> } {
  if (memo !== null && memo.sha === doc.payload_sha256) return memo;
  const map = new Map([...redirectsFromV2(doc)].filter(([from, r]) => isLocalTarget(from) && isLocalTarget(r.to) && (r.status === 301 || r.status === 308)));
  const pages = new Set<string>((doc.pages as Obj[]).map((p) => p.slug as string));
  memo = { sha: doc.payload_sha256, map, pages };
  return memo;
}

/** La redirection d'une adresse demandée, ou `null` : pas dans le document, vraie page du SITE, route machine ou aperçu. */
export function resolveRedirect(doc: Obj | null, pathname: string): Redirect | null {
  if (doc === null || !Array.isArray(doc.redirects) || doc.redirects.length === 0) return null;
  if (!isLocalTarget(pathname) || NEVER_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  const { map, pages } = indexOf(doc);
  for (const candidate of pathname.length > 1 && pathname.endsWith("/") ? [pathname, pathname.slice(0, -1)] : [pathname]) {
    if (REAL_EXACT.has(candidate) || pages.has(candidate)) return null;
    const hit = map.get(candidate);
    if (hit !== undefined) return hit;
  }
  return null;
}
