// Cercle 3 (3.2, 3.23, 3.24, B09 à B11) — les contenus v2 du jeu d'essai d'eb, vus par le SITE : réglages, bandeau, pages éditables (FAQ, texte libre, image du bandeau), relations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/lib/site-content/") && specifier === "./model") return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { editorialFromV2, shopObjectsFromV2, redirectsFromV2 } = await import("../../lib/site-content/v2.ts");
const { activeAnnouncement, parseShop } = await import("../../lib/site-shop/settings.ts");
hooks.deregister();

const doc = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../c0v2/fixtures/documents/V2_CONTENT/content_ready.json"), "utf8"));

test("B05/B06 : les réglages publiés par la Factory (jeu d'essai v2) remplacent les valeurs d'avant", () => {
  const shop = parseShop(shopObjectsFromV2(doc));
  assert.equal(shop.phone, "+33 1 00 00 00 00");
  assert.equal(shop.email, "contact@exemple.invalid");
  assert.equal(shop.openingHours, "Lundi au vendredi, 9 h – 17 h");
  assert.equal(shop.deliveryNotice, "Livraison incluse (texte d'attente)");
  assert.deepEqual(shop.footerLinks.map((l) => l.url), ["/mentions-legales", "/livraison"]);
});

test("B07 : le bandeau du jeu d'essai est affiché dans sa fenêtre, absent hors de sa fenêtre", () => {
  const shop = parseShop(shopObjectsFromV2(doc));
  assert.ok(activeAnnouncement(shop, new Date("2026-11-17T12:00:00Z")));
  assert.equal(activeAnnouncement(shop, new Date("2026-11-19T00:00:00Z")), null);
  assert.equal(shop.maintenance.active, false);
});

test("B09 à B11 : FAQ, contact, mentions légales, livraison sont des pages éditables ; l'image du bandeau d'accueil est celle choisie", () => {
  const set = editorialFromV2(doc);
  assert.deepEqual(set.pages.map((p) => p.slug), ["/", "/contact", "/faq", "/livraison", "/mentions-legales"]);
  const faq = set.pages.find((p) => p.slug === "/faq").sections[0];
  assert.equal(faq.type, "faq");
  assert.ok(faq.data.questions.length >= 1 && typeof faq.data.questions[0].question === "string" && typeof faq.data.questions[0].answer === "string");
  assert.equal(set.pages.find((p) => p.slug === "/livraison").sections[0].type, "rich_text");
  const hero = set.pages.find((p) => p.slug === "/").sections.find((s) => s.type === "hero");
  assert.match(hero.data.imageSha ?? "", /^[0-9a-f]{64}$/, "image du bandeau d'accueil choisie (image_sha256)");
  assert.equal(set.generation, doc.content_sequence);
});

test("3.27 : les relations du document sont celles du jeu d'essai", () => {
  const set = editorialFromV2(doc);
  assert.equal(set.merchandising.length, doc.relations.length);
  assert.ok(set.merchandising.every((r) => ["LIE", "COMPLEMENTAIRE", "UPSELL"].includes(r.kind)));
});

test("3.17 : les anciennes adresses vont de l'ancienne vers la nouvelle, en un saut", () => {
  const redirects = redirectsFromV2(doc);
  assert.deepEqual(redirects.get("/12-bancs"), { to: "/categorie/bancs", status: 301 });
  assert.equal(redirects.size, doc.redirects.length);
});
