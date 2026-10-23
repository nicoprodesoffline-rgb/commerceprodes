/**
 * Proxy (ex-`middleware.ts`, renommé par Next 16) du SITE — W1/BC3. Trois rôles, AVANT toute route :
 *
 * 1. En-têtes de sécurité sur toutes les réponses : CSP à nonce par requête (scripts Next autorisés par nonce +
 *    `strict-dynamic`, aucun script inline sans nonce), `frame-ancestors 'none'`, `object-src 'none'`, etc.
 *    HSTS : envoyé SEULEMENT si la requête est vue en HTTPS (`nextUrl.protocol` ou `x-forwarded-proto: https`
 *    posé par le proxy frontal). En staging HTTP local, aucun HSTS (un navigateur l'ignore sur HTTP, et il
 *    verrouillerait `localhost`). Un `x-forwarded-proto` forgé en HTTP clair n'a aucun effet (RFC 6797 §8.1).
 * 2. CSRF des POST du site (`/api/site/cart/preview`, `/api/site/quote`, `/api/site/order`) AVANT lecture du
 *    corps et donc avant toute persistance BC4 :
 *      - `Content-Type` doit être `application/json` (sinon 415) : un formulaire HTML intersite ne peut pas
 *        l'envoyer sans pré-vol CORS (refusé : aucune en-tête CORS n'est servie) ;
 *      - `Origin`, s'il est présent, doit désigner l'hôte servi (`Host`) (sinon 403) ;
 *      - `Sec-Fetch-Site`, s'il est présent, doit valoir `same-origin` ou `none` (sinon 403).
 *    Un client hors navigateur (tests, outils) qui n'envoie ni `Origin` ni `Sec-Fetch-Site` est admis : ce
 *    n'est pas un vecteur CSRF. Les routes machine signées (`/api/site/publish/**`, `/api/site/events/**`)
 *    ne sont pas concernées (HMAC C0). Aucune limite de débit (dette `DEFERRED_FOR_PROD`).
 * 3. Pages boutique : si l'horloge est mal configurée ou si aucune génération n'est servable, la page
 *    d'indisponibilité est rendue ICI en HTTP 503 (jamais un 500 vide ni un catalogue vide) — revue A2 F-01/F-11.
 */
import { NextResponse, type NextRequest } from "next/server";
import { catalogAvailability } from "@/lib/site-catalog/page";

const CSRF_ROUTES = new Set(["/api/site/cart/preview", "/api/site/quote", "/api/site/order"]);
const PAGE_EXACT = new Set(["/", "/panier", "/recherche", "/devis", "/commande"]);
const PAGE_PREFIXES = ["/categorie/", "/famille/"];

function isStorePage(pathname: string): boolean {
  return PAGE_EXACT.has(pathname) || PAGE_PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length && !pathname.slice(p.length).includes("/"));
}

function csp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Attributs `style` de React/Next (aucun CSS venu de l'utilisateur) : 'unsafe-inline' limité aux styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function isHttps(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function secure<T extends Response>(res: T, req: NextRequest, nonce: string): T {
  res.headers.set("Content-Security-Policy", csp(nonce));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (isHttps(req)) res.headers.set("Strict-Transport-Security", "max-age=31536000");
  return res;
}

function refuse(status: number, site_status: string, message: string): NextResponse {
  return NextResponse.json({ site_status, message, persistence: "NONE", durable: false, verdict: null }, { status, headers: { "cache-control": "no-store" } });
}

/** Vérifie un POST du site (CSRF) ; `null` = admis. */
function csrfRefusal(req: Pick<Request, "headers">): NextResponse | null {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return refuse(415, "CONTENT_TYPE_REFUSED", "Content-Type: application/json exigé");
  const origin = req.headers.get("origin");
  if (origin !== null) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host === null || host !== req.headers.get("host")) return refuse(403, "ORIGIN_REFUSED", "Origine étrangère refusée");
  }
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return refuse(403, "ORIGIN_REFUSED", "Requête intersite refusée");
  return null;
}

const UNAVAILABLE_HTML = (nonce: string, title: string, text: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | PRODES</title>
<style nonce="${nonce}">body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;background:#FBFBFA;color:#1A1A18}main{max-width:40rem;margin:0 auto;padding:4rem 1rem}h1{font-size:1.5rem;font-weight:600;margin:0 0 .75rem}p{color:#55554F}a{color:#1A1A18;display:inline-flex;align-items:center;min-height:42px;padding:0 1rem;border:1px solid #D6D6D1;border-radius:9px;text-decoration:none;margin-top:1rem}a:focus-visible{outline:2px solid #1A1A18;outline-offset:2px}.mark{font-weight:700;letter-spacing:.08em}</style></head>
<body><main data-testid="catalog-unavailable"><p class="mark">PRODES</p><h1>${title}</h1><p>${text}</p><p>Votre panier est conservé sur cet appareil. Nous préférons ne rien afficher plutôt qu'un catalogue incomplet ou des prix non vérifiés.</p><a href="">Réessayer</a></main></body></html>`;

export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const { pathname } = req.nextUrl;

  if (req.method === "POST" && CSRF_ROUTES.has(pathname)) {
    const refused = csrfRefusal(req);
    if (refused) return secure(refused, req, nonce);
  }

  if ((req.method === "GET" || req.method === "HEAD") && isStorePage(pathname)) {
    const a = await catalogAvailability();
    if (!a.ok) {
      const [title, text] =
        a.kind === "CONFIG_INVALID"
          ? ["Boutique momentanément indisponible", "Le serveur de la boutique est mal configuré. L'équipe technique est prévenue."]
          : ["Catalogue indisponible", "Le catalogue ne peut pas être servi pour le moment."];
      const res = new NextResponse(req.method === "HEAD" ? null : UNAVAILABLE_HTML(nonce, title, text), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
      });
      return secure(res, req, nonce);
    }
  }

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp(nonce));
  return secure(NextResponse.next({ request: { headers } }), req, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
