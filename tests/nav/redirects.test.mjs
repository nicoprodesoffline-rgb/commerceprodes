// Cercle 3 (3.17, 3.31) — les anciennes adresses appliquées par le SITE : contenus actifs seulement, cible locale, code du document, jamais une vraie page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/lib/site-content/") && (specifier === "./model" || specifier === "./v2")) return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { resolveRedirect, isLocalTarget } = await import("../../lib/site-content/redirects.ts");
hooks.deregister();

const base = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../c0v2/fixtures/documents/V2_CONTENT/content_ready.json"), "utf8"));
const withRedirects = (redirects, extra = {}) => ({ ...base, payload_sha256: `t-${Math.random()}`, redirects, ...extra });

test("une ancienne adresse du document mène à sa cible avec le code du document", () => {
  assert.deepEqual(resolveRedirect(base, "/12-bancs"), { to: "/categorie/bancs", status: 301 });
  assert.deepEqual(resolveRedirect(base, "/bancs/34-banc-essai-un.html"), { to: "/produit/banc-essai-un", status: 301 });
  const permanent = withRedirects([{ from_path: "/famille/ancien", to_path: "/famille/nouveau", status: 308 }]);
  assert.deepEqual(resolveRedirect(permanent, "/famille/ancien"), { to: "/famille/nouveau", status: 308 });
});

test("une adresse inconnue, ou sans contenus actifs, ne redirige pas", () => {
  assert.equal(resolveRedirect(base, "/inconnue"), null);
  assert.equal(resolveRedirect(null, "/12-bancs"), null);
  assert.equal(resolveRedirect({ ...base, redirects: [] }, "/12-bancs"), null);
});

test("un aperçu, une route machine ou une ressource Next ne sont jamais redirigés", () => {
  const doc = withRedirects([{ from_path: "/apercu/abc", to_path: "/faq", status: 301 }, { from_path: "/api/site/quote", to_path: "/faq", status: 301 }, { from_path: "/_next/x", to_path: "/faq", status: 301 }]);
  for (const p of ["/apercu/abc", "/api/site/quote", "/_next/x"]) assert.equal(resolveRedirect(doc, p), null, p);
});

test("une cible ou une adresse non locale est refusée : pas de redirection ouverte", () => {
  for (const bad of ["//evil.example/x", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/a\\b", "/%5Cevil.example", "/x\ny", "relatif", ""]) assert.equal(isLocalTarget(bad), false, JSON.stringify(bad));
  assert.equal(isLocalTarget("/recherche?q=acier"), true);
  const doc = withRedirects([{ from_path: "/aa", to_path: "//evil.example/x", status: 301 }, { from_path: "/bb", to_path: "https://evil.example", status: 301 }, { from_path: "/cc", to_path: "/categorie/bancs", status: 302 }]);
  for (const p of ["/aa", "/bb", "/cc"]) assert.equal(resolveRedirect(doc, p), null, p);
  assert.equal(resolveRedirect(base, "//evil.example/12-bancs"), null);
});

test("une adresse qui est une vraie page du SITE n'est jamais redirigée", () => {
  const doc = withRedirects([{ from_path: "/panier", to_path: "/faq", status: 301 }, { from_path: "/recherche", to_path: "/faq", status: 301 }, { from_path: "/faq", to_path: "/contact", status: 301 }, { from_path: "/livraison", to_path: "/faq", status: 301 }]);
  for (const p of ["/panier", "/recherche", "/faq", "/livraison"]) assert.equal(resolveRedirect(doc, p), null, p);
});

test("une barre finale ne change pas la décision", () => {
  assert.deepEqual(resolveRedirect(base, "/12-bancs/"), { to: "/categorie/bancs", status: 301 });
  assert.equal(resolveRedirect(withRedirects([{ from_path: "/faq", to_path: "/contact", status: 301 }]), "/faq/"), null);
});
