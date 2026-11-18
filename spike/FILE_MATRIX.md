# FILE_MATRIX — candidat D (coque Next.js stable propre)

Base : `commerceprodes/main@a985aca23df49b66658ef06ce5878ef4bdd84834`. Liste : `git ls-tree -r --name-only a985aca2 -- app components lib` (194 fichiers, `spike/logs/files-at-a985aca2.txt`). LOC = nombre de `\n` du fichier à a985aca2 (le binaire `favicon.ico` compte 0).

Pour D, le mandat §5 réserve les verdicts à KEEP / ADAPT / DELETE ; REPLACE n'est pas utilisé : quand une fonction est reprise par un fichier neuf, le motif DELETE le nomme.

## Totaux

| Verdict | Fichiers | LOC à a985aca2 |
|---|---:|---:|
| KEEP | 1 | 53 |
| ADAPT | 6 | 565 |
| REPLACE | 0 | 0 |
| DELETE | 187 | 21130 (hors favicon.ico binaire) |
| UNKNOWN | 0 | 0 |
| **Total** | **194** | **21748** |

## Fichiers à a985aca2

| Fichier | Verdict | LOC | Motif |
|---|---|---:|---|
| `app/[page]/layout.tsx` | DELETE | 12 | page/route hors S01–S05 ou adossée à Supabase |
| `app/[page]/opengraph-image.tsx` | DELETE | 9 | page/route hors S01–S05 ou adossée à Supabase |
| `app/[page]/page.tsx` | DELETE | 50 | page/route hors S01–S05 ou adossée à Supabase |
| `app/admin/catalogue/page.tsx` | DELETE | 532 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/categories/page.tsx` | DELETE | 188 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/contenu/page.tsx` | DELETE | 283 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/devis/[id]/actions.tsx` | DELETE | 96 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/devis/[id]/page.tsx` | DELETE | 143 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/devis/page.tsx` | DELETE | 165 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/error.tsx` | DELETE | 40 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/ia/page.tsx` | DELETE | 591 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/import/page.tsx` | DELETE | 229 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/layout.tsx` | DELETE | 30 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/login/page.tsx` | DELETE | 94 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/page.tsx` | DELETE | 263 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/paniers-abandonnes/abandoned-cart-row.tsx` | DELETE | 88 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/paniers-abandonnes/page.tsx` | DELETE | 145 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/products/[handle]/editor.tsx` | DELETE | 91 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/products/[handle]/page.tsx` | DELETE | 187 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/products/page.tsx` | DELETE | 203 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/produits/[id]/page.tsx` | DELETE | 502 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/produits/page.tsx` | DELETE | 287 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/seo/page.tsx` | DELETE | 212 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/admin/veille/page.tsx` | DELETE | 225 | back-office legacy (auth par présence de cookie) — E6, hors périmètre site |
| `app/api/admin/analytics/route.ts` | DELETE | 98 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/auth/route.ts` | DELETE | 98 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/categories/[id]/route.ts` | DELETE | 54 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/competitive/route.ts` | DELETE | 88 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/devis/[id]/route.ts` | DELETE | 49 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/devis/[id]/status/route.ts` | DELETE | 39 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/export-products/route.ts` | DELETE | 54 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/homepage-sections/route.ts` | DELETE | 56 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/audit/route.ts` | DELETE | 72 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/bulk-price-update/route.ts` | DELETE | 94 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/categories-list/route.ts` | DELETE | 17 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/detect-duplicates/route.ts` | DELETE | 96 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/generate-descriptions/route.ts` | DELETE | 142 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/ia/thematic-cta/route.ts` | DELETE | 118 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/import-logs/route.ts` | DELETE | 43 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/paniers-abandonnes/[id]/recover/route.ts` | DELETE | 25 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/products-list/route.ts` | DELETE | 71 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/products/[id]/route.ts` | DELETE | 103 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/products/bulk/route.ts` | DELETE | 79 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/site-config/route.ts` | DELETE | 38 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/testimonials/[id]/route.ts` | DELETE | 33 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/testimonials/route.ts` | DELETE | 38 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/admin/trigger-webhook/route.ts` | DELETE | 36 | API admin legacy (Bearer mot de passe / sans auth) — E6 |
| `app/api/cart/abandon/route.ts` | DELETE | 53 | second panier serveur (partage/abandon Supabase) — E4 |
| `app/api/cart/share/route.ts` | DELETE | 34 | second panier serveur (partage/abandon Supabase) — E4 |
| `app/api/checkout/route.ts` | DELETE | 206 | checkout legacy (checkout historique (TVA et port de l'ancien site), devis_requests) — E6 ; remplacé par /api/site/order (simulateur) |
| `app/api/contact/route.ts` | DELETE | 70 | API publique adossée à Supabase, hors S01–S10 |
| `app/api/devis-express/route.ts` | DELETE | 100 | devis legacy (success:true après échec DB) — E6 ; remplacé par /api/site/quote (simulateur) |
| `app/api/devis-status/[orderId]/route.ts` | DELETE | 24 | devis legacy (success:true après échec DB) — E6 ; remplacé par /api/site/quote (simulateur) |
| `app/api/devis/route.ts` | DELETE | 269 | devis legacy (success:true après échec DB) — E6 ; remplacé par /api/site/quote (simulateur) |
| `app/api/product-by-sku/route.ts` | DELETE | 33 | API publique adossée à Supabase, hors S01–S10 |
| `app/api/product-pdf/[handle]/route.ts` | DELETE | 53 | API publique adossée à Supabase, hors S01–S10 |
| `app/api/products-by-handles/route.ts` | DELETE | 42 | API publique adossée à Supabase, hors S01–S10 |
| `app/api/revalidate/route.ts` | DELETE | 6 | route stub/télémétrie Supabase — E6 |
| `app/api/search/route.ts` | DELETE | 73 | API publique adossée à Supabase, hors S01–S10 |
| `app/api/track/route.ts` | DELETE | 46 | route stub/télémétrie Supabase — E6 |
| `app/cart/cart-actions.tsx` | DELETE | 41 | page panier legacy ; remplacée par app/panier |
| `app/cart/page.tsx` | DELETE | 208 | page panier legacy ; remplacée par app/panier |
| `app/checkout/checkout-form.tsx` | DELETE | 321 | checkout legacy (checkout historique (TVA et port de l'ancien site), devis_requests) — E6 ; remplacé par /api/site/order (simulateur) |
| `app/checkout/confirmation/clear-cart.tsx` | DELETE | 12 | checkout legacy (checkout historique (TVA et port de l'ancien site), devis_requests) — E6 ; remplacé par /api/site/order (simulateur) |
| `app/checkout/confirmation/page.tsx` | DELETE | 93 | checkout legacy (checkout historique (TVA et port de l'ancien site), devis_requests) — E6 ; remplacé par /api/site/order (simulateur) |
| `app/checkout/page.tsx` | DELETE | 64 | checkout legacy (checkout historique (TVA et port de l'ancien site), devis_requests) — E6 ; remplacé par /api/site/order (simulateur) |
| `app/compare/compare-client.tsx` | DELETE | 221 | page/route hors S01–S05 ou adossée à Supabase |
| `app/compare/page.tsx` | DELETE | 35 | page/route hors S01–S05 ou adossée à Supabase |
| `app/contact/page.tsx` | DELETE | 211 | page/route hors S01–S05 ou adossée à Supabase |
| `app/devis-express/page.tsx` | DELETE | 410 | page devis express legacy — E6 ; remplacée par le simulateur du panier |
| `app/error.tsx` | DELETE | 36 | page/route hors S01–S05 ou adossée à Supabase |
| `app/faq/page.tsx` | DELETE | 151 | page/route hors S01–S05 ou adossée à Supabase |
| `app/favicon.ico` | DELETE | 0 (binaire) | icône legacy non reprise (aucune icône dans le candidat D) |
| `app/gamme-pro-intens/page.tsx` | DELETE | 148 | page/route hors S01–S05 ou adossée à Supabase |
| `app/globals.css` | ADAPT | 61 | gardés : import Tailwind, variant dark neutralisé, bordure de base, focus-visible PRODES ; retirés : plugins typography/container-queries, prose produit, print ; -37/+6 |
| `app/layout.tsx` | DELETE | 80 | layout legacy (7 contextes, geist, sonner, promo) ; remplacé par app/layout.tsx neuf |
| `app/mentions-legales/page.tsx` | DELETE | 127 | page/route hors S01–S05 ou adossée à Supabase |
| `app/mes-commandes/page.tsx` | DELETE | 123 | suivi/partage legacy adossé à Supabase — E6 |
| `app/mon-devis/[orderId]/page.tsx` | DELETE | 142 | suivi/partage legacy adossé à Supabase — E6 |
| `app/not-found.tsx` | DELETE | 70 | remplacé par app/not-found.tsx neuf (sans footer/legacy links) |
| `app/opengraph-image.tsx` | DELETE | 5 | page/route hors S01–S05 ou adossée à Supabase |
| `app/page.tsx` | DELETE | 367 | accueil legacy (sections Supabase, carrousel embla) ; remplacé par app/page.tsx neuf (hero + catégories + familles) |
| `app/panier/[shareId]/page.tsx` | DELETE | 56 | suivi/partage legacy adossé à Supabase — E6 |
| `app/panier/[shareId]/shared-cart-loader.tsx` | DELETE | 111 | suivi/partage legacy adossé à Supabase — E6 |
| `app/product/[handle]/page.tsx` | DELETE | 188 | fiche produit legacy (Supabase) ; remplacée par app/famille/[slug] |
| `app/robots.ts` | DELETE | 14 | page/route hors S01–S05 ou adossée à Supabase |
| `app/search/[collection]/opengraph-image.tsx` | DELETE | 13 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/search/[collection]/page.tsx` | DELETE | 81 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/search/children-wrapper.tsx` | DELETE | 14 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/search/layout.tsx` | DELETE | 47 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/search/loading.tsx` | DELETE | 14 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/search/page.tsx` | DELETE | 54 | recherche/collections Supabase ; remplacée par app/categorie/[key] |
| `app/sitemap.ts` | DELETE | 60 | page/route hors S01–S05 ou adossée à Supabase |
| `app/wishlist/page.tsx` | DELETE | 207 | page/route hors S01–S05 ou adossée à Supabase |
| `components/admin/analytics-widget.tsx` | DELETE | 163 | back-office legacy |
| `components/admin/kpi-card.tsx` | DELETE | 47 | back-office legacy |
| `components/admin/sidebar.tsx` | DELETE | 100 | back-office legacy |
| `components/admin/status-badge.tsx` | DELETE | 27 | back-office legacy |
| `components/carousel.tsx` | DELETE | 45 | tuiles produit legacy (types Supabase/clsx/Label) ; remplacé par components/home/family-card |
| `components/cart/actions.ts` | DELETE | 52 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/add-to-cart.tsx` | DELETE | 94 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/cart-context.tsx` | DELETE | 281 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/delete-item-button.tsx` | DELETE | 38 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/edit-item-quantity-button.tsx` | DELETE | 61 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/modal.tsx` | DELETE | 250 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/open-cart.tsx` | DELETE | 27 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/cart/share-cart-button.tsx` | DELETE | 49 | panier legacy (actions serveur no-op, types Supabase, localStorage divergent) — E4 ; remplacé par components/cart/cart-provider + cart-view |
| `components/checkout/stripe-button.tsx` | DELETE | 46 | paiement legacy non utilisé |
| `components/compare/compare-bar.tsx` | DELETE | 63 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/faq/faq-accordion.tsx` | DELETE | 74 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/grid/index.tsx` | DELETE | 27 | tuiles produit legacy (types Supabase/clsx/Label) ; remplacé par components/home/family-card |
| `components/grid/three-items.tsx` | DELETE | 67 | tuiles produit legacy (types Supabase/clsx/Label) ; remplacé par components/home/family-card |
| `components/grid/tile.tsx` | DELETE | 50 | tuiles produit legacy (types Supabase/clsx/Label) ; remplacé par components/home/family-card |
| `components/home/category-grid.tsx` | ADAPT | 34 | type Supabase CategoryWithCount remplacé par un type local (category_key, family_count) ; href /search/slug → /categorie/key ; -6/+12 |
| `components/home/featured-products.tsx` | DELETE | 25 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/home/hero.tsx` | ADAPT | 58 | textes non vérifiables (« 983 références », « devis sous 24h », « livraison rapide ») remplacés par des états honnêtes (démo, SIMULATION) ; liens /search → ancres ; -9/+9 |
| `components/home/product-carousel.tsx` | DELETE | 150 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/home/testimonials-section.tsx` | DELETE | 94 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/home/trust-bar.tsx` | DELETE | 23 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/icons/logo.tsx` | DELETE | 16 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/label.tsx` | DELETE | 39 | parseFloat sur montant (Number comme vérité) ; remplacé par lib/format.ts (chaîne décimale) |
| `components/layout/breadcrumbs.tsx` | KEEP | 53 | copié intact (aucune dépendance métier ; next/link seulement) |
| `components/layout/category-sidebar.tsx` | DELETE | 204 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/footer-menu.tsx` | DELETE | 46 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/footer.tsx` | ADAPT | 120 | liens vers routes supprimées retirés (8→2), mention TVA reformulée, filtre CSS du logo retiré (carré blanc) ; -35/+5 lignes |
| `components/layout/mobile-bottom-nav.tsx` | DELETE | 57 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/layout/navbar/index.tsx` | DELETE | 119 | navbar couplée Supabase, modal panier, recherche, quote-bar ; remplacée par components/layout/site-header |
| `components/layout/navbar/mobile-menu.tsx` | DELETE | 104 | navbar couplée Supabase, modal panier, recherche, quote-bar ; remplacée par components/layout/site-header |
| `components/layout/navbar/search.tsx` | DELETE | 43 | navbar couplée Supabase, modal panier, recherche, quote-bar ; remplacée par components/layout/site-header |
| `components/layout/product-grid-items.tsx` | DELETE | 101 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/promo-banner.tsx` | DELETE | 59 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/layout/search/catalog-filters.tsx` | DELETE | 123 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/search/collections.tsx` | DELETE | 37 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/search/filter/dropdown.tsx` | DELETE | 64 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/search/filter/index.tsx` | DELETE | 47 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/layout/search/filter/item.tsx` | DELETE | 74 | recherche/filtres/grilles legacy adossés à Supabase, hors S01–S05 |
| `components/loading-dots.tsx` | DELETE | 15 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/logo-square.tsx` | DELETE | 23 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/onboarding/welcome-modal.tsx` | DELETE | 141 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/opengraph-image.tsx` | DELETE | 45 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/price.tsx` | DELETE | 20 | parseFloat sur montant (Number comme vérité) ; remplacé par lib/format.ts (chaîne décimale) |
| `components/product-image.tsx` | DELETE | 37 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/product/compare-button.tsx` | DELETE | 37 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/product/devis-modal.tsx` | DELETE | 190 | modales devis/mandat legacy (@headlessui) — flux remplacé par le simulateur |
| `components/product/gallery.tsx` | DELETE | 96 | dépend de heroicons + GridTileImage (clsx, Label, Price parseFloat) ; une seule image par famille/variante dans la fixture : affichage image Famille/Item réécrit (famille/[slug], family-buy-box) |
| `components/product/mandat-modal.tsx` | DELETE | 80 | modales devis/mandat legacy (@headlessui) — flux remplacé par le simulateur |
| `components/product/price-grid.tsx` | ADAPT | 103 | quasi-réécriture : seul le gabarit du tableau est conservé ; calcul PBQ fixed/percentage et colonne « Économie » supprimés, lignes = fenêtres SELL publiées (état actif/à venir, rate_id) ; -76/+71 |
| `components/product/product-badges.tsx` | DELETE | 83 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/product/product-card-skeleton.tsx` | DELETE | 22 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/product/product-description.tsx` | DELETE | 404 | monolithe 404 l. couplé panier/devis/mandat/eco/analytics/quote-bar ; remplacé par family-buy-box |
| `components/product/recently-viewed.tsx` | DELETE | 70 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/product/variant-selector.tsx` | ADAPT | 189 | helpers couleur/libellés et markup des boutons gardés ; types Supabase et matching remplacés par items READY du DTO, sélection contrôlée, aria-pressed, valeurs non publiées désactivées, note des combinaisons non proposées ; -45/+64 |
| `components/product/wishlist-button.tsx` | DELETE | 48 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/prose.tsx` | DELETE | 15 | dangerouslySetInnerHTML ; descriptions de la fixture en texte brut |
| `components/quick-order/quick-order-bar.tsx` | DELETE | 92 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/quote/quote-bar.tsx` | DELETE | 209 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/search/live-search.tsx` | DELETE | 193 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/ui/skeleton.tsx` | DELETE | 9 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `components/welcome-toast.tsx` | DELETE | 36 | composant hors périmètre S01–S05 ou couplé à un contexte legacy (wishlist, compare, quote, onboarding, toast, analytics…) |
| `lib/admin/n8n-webhooks.ts` | DELETE | 35 | back-office legacy |
| `lib/analytics/tracker.ts` | DELETE | 50 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/cart/persist.ts` | DELETE | 59 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/compare/context.tsx` | DELETE | 92 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/constants.ts` | DELETE | 51 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/email/sender.ts` | DELETE | 204 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/logger.ts` | DELETE | 25 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/pdf/product-pdf.ts` | DELETE | 186 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/quote/context.tsx` | DELETE | 121 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/rate-limit.ts` | DELETE | 27 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/recently-viewed.ts` | DELETE | 23 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/seo/score.ts` | DELETE | 80 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/shopify/fragments/cart.ts` | DELETE | 53 | code mort Shopify (aucun import) |
| `lib/shopify/fragments/image.ts` | DELETE | 10 | code mort Shopify (aucun import) |
| `lib/shopify/fragments/product.ts` | DELETE | 64 | code mort Shopify (aucun import) |
| `lib/shopify/fragments/seo.ts` | DELETE | 8 | code mort Shopify (aucun import) |
| `lib/shopify/index.ts` | DELETE | 543 | code mort Shopify (aucun import) |
| `lib/shopify/mutations/cart.ts` | DELETE | 45 | code mort Shopify (aucun import) |
| `lib/shopify/queries/cart.ts` | DELETE | 10 | code mort Shopify (aucun import) |
| `lib/shopify/queries/collection.ts` | DELETE | 56 | code mort Shopify (aucun import) |
| `lib/shopify/queries/menu.ts` | DELETE | 10 | code mort Shopify (aucun import) |
| `lib/shopify/queries/page.ts` | DELETE | 41 | code mort Shopify (aucun import) |
| `lib/shopify/queries/product.ts` | DELETE | 36 | code mort Shopify (aucun import) |
| `lib/shopify/types.ts` | DELETE | 272 | code mort Shopify (aucun import) |
| `lib/supabase/client.ts` | DELETE | 21 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/supabase/index.ts` | DELETE | 1332 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/supabase/index.ts.bak` | DELETE | 1186 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/supabase/price.ts` | DELETE | 64 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/supabase/types.ts` | DELETE | 261 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/supabase/types.ts.bak` | DELETE | 186 | data layer Supabase (+ .bak) — E2 ; remplacé par lib/site-dto |
| `lib/type-guards.ts` | DELETE | 31 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/utils.ts` | DELETE | 42 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/utils/eco.ts` | DELETE | 26 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/validation.ts` | DELETE | 28 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |
| `lib/wishlist/context.tsx` | DELETE | 62 | utilitaire legacy sans usage dans le candidat D (contexte, email, pdf, seo, validation, rate-limit…) |

## Fichiers neufs (écrits de zéro) sous app/ components/ lib/

| Fichier | LOC | Rôle |
|---|---:|---|
| `lib/site-dto/index.ts` | 342 | adaptateur DTO unique (seul lecteur de la fixture) |
| `lib/site-dto/view.ts` | 55 | projections d'affichage (libellés de validité, combinaisons non proposées) |
| `lib/simulator/index.ts` | 215 | revalidation des lignes + simulateur devis/commande + idempotence |
| `lib/simulator/http.ts` | 19 | lecture JSON bornée |
| `lib/format.ts` | 27 | formatage décimal/axes sans Number |
| `app/layout.tsx` | 29 | layout racine (dynamique) |
| `app/page.tsx` | 36 | S01 accueil |
| `app/categorie/[key]/page.tsx` | 28 | liste familles par catégorie |
| `app/famille/[slug]/page.tsx` | 78 | S02–S04 fiche famille |
| `app/panier/page.tsx` | 15 | S05 panier |
| `app/not-found.tsx` | 11 | 404 |
| `app/api/site/cart/preview/route.ts` | 17 | aperçu panier (sélection serveur) |
| `app/api/site/quote/route.ts` | 12 | simulateur devis |
| `app/api/site/order/route.ts` | 12 | simulateur commande |
| `app/media/[sha256]/route.ts` | 13 | médias de la fixture par sha256 |
| `components/cart/cart-provider.tsx` | 94 | panier unique (brouillon) |
| `components/cart/cart-view.tsx` | 229 | UI panier + formulaire simulation |
| `components/product/family-buy-box.tsx` | 139 | bloc Item : variantes, image, paliers, ajout |
| `components/home/family-card.tsx` | 37 | carte Famille |
| `components/layout/site-header.tsx` | 26 | en-tête + bandeau STAGING/SIMULATION |
| **Total écrit de zéro (app/components/lib)** | **1434** | |

## Configuration et outillage du spike (hors app/components/lib)

| Fichier | LOC | Note |
|---|---:|---|
| `package.json` | 32 |  |
| `tsconfig.json` | 46 | (complété par next build : include .next/dev/types) |
| `next.config.ts` | 24 |  |
| `postcss.config.mjs` | 6 | copié intact de a985aca2 |
| `spike/http-tests.mjs` | 208 | tests HTTP E7 |
| `spike/screenshots.mjs` | 127 | captures CDP E7 |

Autres éléments conservés hors matrice : `public/logo-prodes.png` (octets identiques à a985aca2), `AGENTS.md`, `CLAUDE.md`, `license.md`, `README.md` (mis à jour), outillage agent-ops (`docs/agent-ops`, `scripts/agent_ops`, `tests/agent-ops`, `agent-skills`). Fixture copiée sous `fixtures/provisional-v0/` (vérifiée par `shasum -c`).

Le diff global mesuré est dans `spike/logs/git-diff-stat.txt` (`git diff --stat a985aca2`).
