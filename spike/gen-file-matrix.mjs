#!/usr/bin/env node
// Génère spike/FILE_MATRIX.md à partir de git (base a985aca2 -> HEAD).
// Verdict mesuré : absent à HEAD = DELETE ; identique = KEEP ; modifié = ADAPT,
// ou REPLACE si >= 70 % des lignes d'origine sont supprimées (réécriture).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "a985aca23df49b66658ef06ce5878ef4bdd84834";
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 26 });
const baseFiles = git("ls-tree", "-r", "--name-only", BASE, "--", "app", "components", "lib").trim().split("\n");
const headFiles = new Set(git("ls-tree", "-r", "--name-only", "HEAD", "--", "app", "components", "lib").trim().split("\n"));
const numstat = new Map();
for (const l of git("diff", "--numstat", BASE, "HEAD", "--", "app", "components", "lib").trim().split("\n")) {
  const [add, del, path] = l.split("\t");
  numstat.set(path, { add: add === "-" ? 0 : +add, del: del === "-" ? 0 : +del });
}
const baseLoc = (p) => (p.endsWith(".ico") ? 0 : git("show", `${BASE}:${p}`).split("\n").length - 1);

const DELETE_REASONS = [
  [/^app\/admin\//, "E6 : back-office admin (auth par présence de cookie), hors spike"],
  [/^app\/api\/admin\//, "E6 : API admin (Bearer/cookie forgeable, routes sans auth)"],
  [/^app\/api\/checkout\//, "E6 : checkout legacy (TVA 20 %, port 20 €, devis_requests)"],
  [/^app\/api\/devis-express\//, "E6 : devis express legacy (Supabase)"],
  [/^app\/api\/devis\//, "E6 : devis legacy (success:true après échec DB)"],
  [/^app\/api\/revalidate\//, "E6 : stub revalidate sans contrôle"],
  [/^app\/api\/track\//, "E6 : tracking analytics (Supabase)"],
  [/^app\/api\//, "Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet)"],
  [/^app\/checkout\//, "E6 : pages checkout legacy"],
  [/^app\/mes-commandes\//, "E6 : historique commandes sans backend"],
  [/^app\/mon-devis\//, "E6 : suivi devis (Supabase)"],
  [/^app\/panier\//, "E6 : panier partagé = second panier (Supabase shared_carts)"],
  [/^app\/compare\//, "Comparateur (Supabase), hors scénarios"],
  [/^app\/wishlist\//, "Liste d'envies localStorage + partage panier : second panier"],
  [/^app\/devis-express\//, "Formulaire devis express vers route E6 supprimée"],
  [/^app\/gamme-pro-intens\//, "Landing produits Supabase hors fixture"],
  [/^app\/\[page\]\//, "Pages CMS Supabase (getPage) sans équivalent dans la fixture"],
  [/^app\/search\/\[collection\]\/opengraph-image/, "OG image via getCollection Supabase"],
  [/^components\/admin\//, "UI admin"],
  [/^components\/checkout\//, "Bouton Stripe inutilisé (code mort)"],
  [/^components\/compare\//, "Comparateur"],
  [/^components\/quote\//, "Devis groupé localStorage = second panier"],
  [/^components\/quick-order\//, "Commande rapide par SKU (API Supabase)"],
  [/^components\/onboarding\//, "Modale d'accueil marketing, hors scénarios"],
  [/^components\/welcome-toast/, "Toast démo Vercel/Shopify"],
  [/^components\/carousel/, "Carrousel Supabase (getCollectionProducts)"],
  [/^components\/grid\/three-items/, "Grille vitrine Supabase"],
  [/^components\/home\/(featured-products|product-carousel|testimonials-section|trust-bar)/, "Bloc d'accueil Supabase/embla ou non utilisé"],
  [/^components\/layout\/footer-menu/, "Menu pied de page typé Supabase, non utilisé"],
  [/^components\/layout\/search\//, "Filtres/tri Supabase (prix float, stock) sans équivalent DTO"],
  [/^components\/layout\/promo-banner/, "Bandeau masquable (localStorage) remplacé par bandeau SIMULATION non masquable"],
  [/^components\/search\//, "Recherche live via /api/search (Supabase)"],
  [/^components\/product\/(compare-button|wishlist-button)/, "Comparateur / liste d'envies"],
  [/^components\/product\/recently-viewed/, "Vus récemment via /api/products-by-handles"],
  [/^components\/product\/(devis-modal|mandat-modal)/, "Modales vers /api/devis legacy ; devis via simulateur panier"],
  [/^components\/product\/product-badges/, "Badges promo/stock typés Supabase (pas de champ équivalent)"],
  [/^components\/product\/product-card-skeleton/, "Squelette non utilisé"],
  [/^components\/ui\//, "Squelette non utilisé"],
  [/^components\/cart\/actions/, "Actions serveur no-op (interdit E4)"],
  [/^components\/cart\/share-cart-button/, "Partage panier (/api/cart/share)"],
  [/^components\/cart\/add-to-cart/, "Bouton legacy (action serveur no-op), non utilisé"],
  [/^components\/(logo-square|loading-dots)/, "Non utilisé après suppression"],
  [/^components\/prose/, "Rendu HTML brut (dangerouslySetInnerHTML) ; descriptions fixture en texte"],
  [/^lib\/supabase\//, "E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto"],
  [/^lib\/shopify\//, "E2 : code Shopify mort"],
  [/^lib\/(admin|analytics|cart|compare|email|pdf|quote|seo|wishlist)\//, "Fonction hors scénarios dépendant de routes/API supprimées"],
  [/^lib\/(recently-viewed|rate-limit|validation|logger|type-guards|constants)\.ts/, "Utilitaire des routes supprimées / constantes Shopify"],
  [/^lib\/utils\/eco/, "Éco-participation : règle métier non qualifiée"],
];
const NOTES = {
  "app/cart/cart-actions.tsx": "Boutons +/− branchés sur le panier unique, aria-label",
  "app/cart/page.tsx": "Lignes DTO, prix par fenêtre + rate_id, TVA/port « non qualifiés », formulaire simulation",
  "app/contact/page.tsx": "Envoi désactivé (route Supabase supprimée), message honnête",
  "app/layout.tsx": "Providers legacy retirés, bandeau SIMULATION, instant SPIKE_NOW_UTC, noindex",
  "app/not-found.tsx": "Lien devis-express -> /cart",
  "app/page.tsx": "Accueil S01 : catégories + familles du DTO ; sections Supabase/marketing retirées",
  "app/product/[handle]/page.tsx": "Fiche famille DTO, galerie Famille puis Item, sélection par URL",
  "app/search/[collection]/page.tsx": "Catégorie DTO (slug = category_key)",
  "app/search/layout.tsx": "Sidebar catégories DTO ; filtres/tri retirés",
  "app/search/page.tsx": "Recherche texte sur familles DTO",
  "app/sitemap.ts": "Sitemap depuis DTO",
  "components/cart/cart-context.tsx": "Panier unique réécrit : lignes item + fenêtres, sélection pure, centimes",
  "components/cart/delete-item-button.tsx": "Action serveur retirée, bouton client",
  "components/cart/edit-item-quantity-button.tsx": "Action serveur retirée, bouton client",
  "components/cart/modal.tsx": "Lignes DTO, TTC 20 % retiré, lien panier/simulation",
  "components/home/category-grid.tsx": "Type CategoryView, compte de familles",
  "components/home/hero.tsx": "Allégations non qualifiées retirées (livraison, 983 réf.)",
  "components/layout/category-sidebar.tsx": "Type CategoryView, aria-expanded",
  "components/layout/footer.tsx": "Liens catégories fixture, devis-express retiré",
  "components/layout/mobile-bottom-nav.tsx": "Compteur du panier unique, lien Devis -> /cart",
  "components/layout/navbar/index.tsx": "Menu = catégories DTO, Search conservé, LiveSearch/devis groupé retirés",
  "components/layout/navbar/mobile-menu.tsx": "Type Menu local, libellés FR",
  "components/layout/product-grid-items.tsx": "Carte Famille (non achetable), sans prix agrégé",
  "components/price.tsx": "Formatage depuis chaîne décimale, base fiscale du snapshot",
  "components/product/price-grid.tsx": "Fenêtres SELL affichées telles quelles ; calcul PBQ/économie supprimé",
  "components/product/product-description.tsx": "Sélection item/quantité -> selectWindow ; devis/mandat/PDF/éco retirés",
  "components/product/variant-selector.tsx": "Axes DTO, valeurs absentes/interdites désactivées avec raison",
  "lib/utils.ts": "validateEnvironmentVariables Supabase retiré",
};
const KEEP_NOTES = {
  "app/error.tsx": "Inchangé", "app/favicon.ico": "Inchangé", "app/faq/page.tsx": "Inchangé (contient des allégations TVA/livraison non qualifiées : à revoir)",
  "app/globals.css": "Inchangé", "app/mentions-legales/page.tsx": "Inchangé", "app/opengraph-image.tsx": "Inchangé", "app/robots.ts": "Inchangé",
  "app/search/children-wrapper.tsx": "Inchangé", "app/search/loading.tsx": "Inchangé",
  "components/cart/open-cart.tsx": "Inchangé", "components/faq/faq-accordion.tsx": "Inchangé", "components/grid/index.tsx": "Inchangé",
  "components/grid/tile.tsx": "Inchangé", "components/icons/logo.tsx": "Inchangé", "components/label.tsx": "Inchangé",
  "components/layout/breadcrumbs.tsx": "Inchangé", "components/layout/navbar/search.tsx": "Inchangé", "components/opengraph-image.tsx": "Inchangé",
  "components/product-image.tsx": "Inchangé", "components/product/gallery.tsx": "Inchangé (galerie pilotée par ?image=)",
};

const rows = [];
for (const p of baseFiles) {
  const loc = baseLoc(p);
  if (!headFiles.has(p)) {
    const reason = DELETE_REASONS.find(([re]) => re.test(p))?.[1];
    rows.push({ p, v: reason ? "DELETE" : "UNKNOWN", why: reason ?? "aucun motif", loc, add: 0, del: loc });
    continue;
  }
  const ns = numstat.get(p);
  if (!ns) { rows.push({ p, v: "KEEP", why: KEEP_NOTES[p] ?? "Inchangé", loc, add: 0, del: 0 }); continue; }
  const v = loc > 0 && ns.del / loc >= 0.7 ? "REPLACE" : "ADAPT";
  rows.push({ p, v, why: NOTES[p] ?? "modifié", loc, add: ns.add, del: ns.del });
}
const totals = {};
for (const r of rows) {
  totals[r.v] ??= { files: 0, baseLoc: 0 };
  totals[r.v].files++; totals[r.v].baseLoc += r.loc;
}
const newFiles = git("diff", "--name-only", "--diff-filter=A", BASE, "HEAD", "--", "app", "components", "lib").trim().split("\n").filter(Boolean);
const newRows = newFiles.map((p) => ({ p, loc: git("show", `HEAD:${p}`).split("\n").length - 1 }));
const stat = git("diff", "--shortstat", BASE, "HEAD", "--", "app", "components", "lib").trim();
const statAll = git("diff", "--shortstat", BASE, "HEAD").trim();

let md = `# BC1-B — Matrice de fichiers (E8)\n\nBase \`${BASE}\` → HEAD \`${git("rev-parse", "HEAD").trim()}\` (matrice générée par \`node spike/gen-file-matrix.mjs\`).\n\n`;
md += `Règle de verdict (mesurée sur git, pas jugée) : absent à HEAD = **DELETE** ; identique octet pour octet = **KEEP** ; modifié = **ADAPT**, ou **REPLACE** si ≥ 70 % des lignes d'origine sont supprimées par \`git diff --numstat\` (réécriture au même chemin). UNKNOWN = fichier supprimé sans motif répertorié.\n\n`;
md += `LOC = lignes du fichier à la base (\`.ico\` compté 0). +/− = \`git diff --numstat\`.\n\n## Totaux\n\n| Verdict | Fichiers | LOC base |\n|---|---:|---:|\n`;
for (const v of ["KEEP", "ADAPT", "REPLACE", "DELETE", "UNKNOWN"]) md += `| ${v} | ${totals[v]?.files ?? 0} | ${totals[v]?.baseLoc ?? 0} |\n`;
md += `| **Total** | ${rows.length} | ${rows.reduce((s, r) => s + r.loc, 0)} |\n\n`;
md += `\`git diff --shortstat ${BASE.slice(0, 8)} HEAD -- app components lib\` : ${stat}\n\n\`git diff --shortstat ${BASE.slice(0, 8)} HEAD\` (dépôt entier, inclut fixture, lockfile, spike/) : ${statAll}\n\n`;
md += `## Nouveaux fichiers (app/, components/, lib/)\n\n| Fichier | LOC |\n|---|---:|\n`;
for (const r of newRows) md += `| \`${r.p}\` | ${r.loc} |\n`;
md += `| **Total** | ${newRows.reduce((s, r) => s + r.loc, 0)} |\n\n`;
md += `## Fichiers de la base (${rows.length})\n\n| Fichier | Verdict | LOC base | + | − | Motif |\n|---|---|---:|---:|---:|---|\n`;
for (const r of rows) md += `| \`${r.p}\` | ${r.v} | ${r.loc} | ${r.add} | ${r.del} | ${r.why} |\n`;
writeFileSync("spike/FILE_MATRIX.md", md);
console.log(JSON.stringify({ totals, newFiles: newRows, stat, statAll }, null, 2));
