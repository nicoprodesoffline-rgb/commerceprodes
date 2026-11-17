// Cercle 3, 3.23 (B05 à B08, E03) — les réglages de la boutique côté SITE : valeurs d'avant le lot par défaut, bandeau daté, maintenance, liens sûrs, texte échappé. Fonctions pures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHOP, activeAnnouncement, escapeHtml, parseShop, safeLink } from "../../lib/site-shop/settings.ts";

test("sans réglage publié, le SITE garde les valeurs d'avant (horaires et livraison)", () => {
  assert.deepEqual(parseShop(null), DEFAULT_SHOP);
  assert.equal(parseShop({}).openingHours, "Lun–Sam 8h30–19h");
  assert.equal(parseShop({}).deliveryNotice, "Livraison incluse sur tout le catalogue");
});

test("B05/B06 : téléphone, e-mail, adresse, horaires et livraison publiés remplacent les valeurs d'avant", () => {
  const s = parseShop({ shop: { phone: "01 00 00 00 00", email: "contact@exemple.test", address: "1 rue d'essai", opening_hours: "Lun–Ven 9h–17h", delivery_notice: "Livraison offerte dès 500 €", footer_links: [] } });
  assert.deepEqual([s.phone, s.email, s.address, s.openingHours, s.deliveryNotice], ["01 00 00 00 00", "contact@exemple.test", "1 rue d'essai", "Lun–Ven 9h–17h", "Livraison offerte dès 500 €"]);
});

test("B07 : bandeau affiché entre son début (hier) et sa fin (demain), absent après sa fin", () => {
  const s = parseShop({ announcement: { text: "Soldes", link: "/promotions", start: "2026-11-16T12:00:00Z", end: "2026-11-18T12:00:00Z" } });
  assert.equal(activeAnnouncement(s, new Date("2026-11-17T12:00:00Z"))?.text, "Soldes");
  assert.equal(activeAnnouncement(s, new Date("2026-11-15T12:00:00Z")), null);
  assert.equal(activeAnnouncement(s, new Date("2026-11-18T12:00:00Z")), null);
  assert.equal(activeAnnouncement(parseShop({}), new Date()), null);
});

test("B08 : la maintenance n'est active qu'avec son message", () => {
  assert.equal(parseShop({ maintenance: { active: true, message: "Retour à 14 h." } }).maintenance.active, true);
  assert.equal(parseShop({ maintenance: { active: true, message: "" } }).maintenance.active, false);
  assert.equal(parseShop({ maintenance: { active: false, message: "Retour à 14 h." } }).maintenance.active, false);
});

test("un lien piégé (script, fichier, //hôte) est écarté du pied de page et du bandeau", () => {
  assert.equal(safeLink("/faq"), true);
  assert.equal(safeLink("https://exemple.test/a"), true);
  for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "//evil.test/x", "data:text/html,x", ""]) assert.equal(safeLink(bad), false, bad);
  const s = parseShop({ shop: { footer_links: [{ label: "FAQ", url: "/faq" }, { label: "Piège", url: "javascript:alert(1)" }] }, announcement: { text: "x", link: "javascript:alert(1)" } });
  assert.deepEqual(s.footerLinks, [{ label: "FAQ", url: "/faq" }]);
  assert.equal(s.announcement.link, "");
});

test("E03 : un réglage contenant du HTML reste du texte (la page de maintenance l'échappe)", () => {
  const s = parseShop({ shop: { delivery_notice: "<b>Livraison</b> <script>x</script>" }, maintenance: { active: true, message: "<img src=x onerror=alert(1)>" } });
  assert.equal(s.deliveryNotice, "<b>Livraison</b> <script>x</script>");
  assert.equal(escapeHtml(s.maintenance.message), "&lt;img src=x onerror=alert(1)&gt;");
});
