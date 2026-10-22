# BC1-B — Matrice de fichiers (E8)

Base `a985aca23df49b66658ef06ce5878ef4bdd84834` → HEAD `bc7177a0dcf07c97b0765275541f45734833edde` (matrice générée par `node spike/gen-file-matrix.mjs`).

Règle de verdict (mesurée sur git, pas jugée) : absent à HEAD = **DELETE** ; identique octet pour octet = **KEEP** ; modifié = **ADAPT**, ou **REPLACE** si ≥ 70 % des lignes d'origine sont supprimées par `git diff --numstat` (réécriture au même chemin). UNKNOWN = fichier supprimé sans motif répertorié.

LOC = lignes du fichier à la base (`.ico` compté 0). +/− = `git diff --numstat`.

## Totaux

| Verdict | Fichiers | LOC base |
|---|---:|---:|
| KEEP | 20 | 929 |
| ADAPT | 23 | 2379 |
| REPLACE | 5 | 1213 |
| DELETE | 146 | 17227 |
| UNKNOWN | 0 | 0 |
| **Total** | 194 | 21748 |

`git diff --shortstat a985aca2 HEAD -- app components lib` : 184 files changed, 1702 insertions(+), 19129 deletions(-)

`git diff --shortstat a985aca2 HEAD` (dépôt entier, inclut fixture, lockfile, spike/) : 256 files changed, 9066 insertions(+), 22590 deletions(-)

## Nouveaux fichiers (app/, components/, lib/)

| Fichier | LOC |
|---|---:|
| `app/api/site/order/route.ts` | 4 |
| `app/api/site/quote/route.ts` | 4 |
| `app/media/[sha]/route.ts` | 13 |
| `components/cart/simulation-form.tsx` | 188 |
| `lib/site-dto/index.ts` | 171 |
| `lib/site-dto/pricing.ts` | 122 |
| `lib/site-dto/types.ts` | 128 |
| `lib/site-dto/variants.ts` | 57 |
| `lib/site-sim/route-handler.ts` | 18 |
| `lib/site-sim/simulator.ts` | 225 |
| **Total** | 930 |

## Fichiers de la base (194)

| Fichier | Verdict | LOC base | + | − | Motif |
|---|---|---:|---:|---:|---|
| `app/[page]/layout.tsx` | DELETE | 12 | 0 | 12 | Pages CMS Supabase (getPage) sans équivalent dans la fixture |
| `app/[page]/opengraph-image.tsx` | DELETE | 9 | 0 | 9 | Pages CMS Supabase (getPage) sans équivalent dans la fixture |
| `app/[page]/page.tsx` | DELETE | 50 | 0 | 50 | Pages CMS Supabase (getPage) sans équivalent dans la fixture |
| `app/admin/catalogue/page.tsx` | DELETE | 532 | 0 | 532 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/categories/page.tsx` | DELETE | 188 | 0 | 188 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/contenu/page.tsx` | DELETE | 283 | 0 | 283 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/devis/[id]/actions.tsx` | DELETE | 96 | 0 | 96 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/devis/[id]/page.tsx` | DELETE | 143 | 0 | 143 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/devis/page.tsx` | DELETE | 165 | 0 | 165 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/error.tsx` | DELETE | 40 | 0 | 40 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/ia/page.tsx` | DELETE | 591 | 0 | 591 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/import/page.tsx` | DELETE | 229 | 0 | 229 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/layout.tsx` | DELETE | 30 | 0 | 30 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/login/page.tsx` | DELETE | 94 | 0 | 94 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/page.tsx` | DELETE | 263 | 0 | 263 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/paniers-abandonnes/abandoned-cart-row.tsx` | DELETE | 88 | 0 | 88 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/paniers-abandonnes/page.tsx` | DELETE | 145 | 0 | 145 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/products/[handle]/editor.tsx` | DELETE | 91 | 0 | 91 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/products/[handle]/page.tsx` | DELETE | 187 | 0 | 187 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/products/page.tsx` | DELETE | 203 | 0 | 203 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/produits/[id]/page.tsx` | DELETE | 502 | 0 | 502 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/produits/page.tsx` | DELETE | 287 | 0 | 287 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/seo/page.tsx` | DELETE | 212 | 0 | 212 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/admin/veille/page.tsx` | DELETE | 225 | 0 | 225 | E6 : back-office admin (auth par présence de cookie), hors spike |
| `app/api/admin/analytics/route.ts` | DELETE | 98 | 0 | 98 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/auth/route.ts` | DELETE | 98 | 0 | 98 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/categories/[id]/route.ts` | DELETE | 54 | 0 | 54 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/competitive/route.ts` | DELETE | 88 | 0 | 88 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/devis/[id]/route.ts` | DELETE | 49 | 0 | 49 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/devis/[id]/status/route.ts` | DELETE | 39 | 0 | 39 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/export-products/route.ts` | DELETE | 54 | 0 | 54 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/homepage-sections/route.ts` | DELETE | 56 | 0 | 56 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/audit/route.ts` | DELETE | 72 | 0 | 72 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/bulk-price-update/route.ts` | DELETE | 94 | 0 | 94 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/categories-list/route.ts` | DELETE | 17 | 0 | 17 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/detect-duplicates/route.ts` | DELETE | 96 | 0 | 96 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/generate-descriptions/route.ts` | DELETE | 142 | 0 | 142 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/ia/thematic-cta/route.ts` | DELETE | 118 | 0 | 118 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/import-logs/route.ts` | DELETE | 43 | 0 | 43 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/paniers-abandonnes/[id]/recover/route.ts` | DELETE | 25 | 0 | 25 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/products-list/route.ts` | DELETE | 71 | 0 | 71 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/products/[id]/route.ts` | DELETE | 103 | 0 | 103 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/products/bulk/route.ts` | DELETE | 79 | 0 | 79 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/site-config/route.ts` | DELETE | 38 | 0 | 38 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/testimonials/[id]/route.ts` | DELETE | 33 | 0 | 33 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/testimonials/route.ts` | DELETE | 38 | 0 | 38 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/admin/trigger-webhook/route.ts` | DELETE | 36 | 0 | 36 | E6 : API admin (Bearer/cookie forgeable, routes sans auth) |
| `app/api/cart/abandon/route.ts` | DELETE | 53 | 0 | 53 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/cart/share/route.ts` | DELETE | 34 | 0 | 34 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/checkout/route.ts` | DELETE | 206 | 0 | 206 | E6 : checkout legacy (TVA 20 %, port 20 €, devis_requests) |
| `app/api/contact/route.ts` | DELETE | 70 | 0 | 70 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/devis-express/route.ts` | DELETE | 100 | 0 | 100 | E6 : devis express legacy (Supabase) |
| `app/api/devis-status/[orderId]/route.ts` | DELETE | 24 | 0 | 24 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/devis/route.ts` | DELETE | 269 | 0 | 269 | E6 : devis legacy (success:true après échec DB) |
| `app/api/product-by-sku/route.ts` | DELETE | 33 | 0 | 33 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/product-pdf/[handle]/route.ts` | DELETE | 53 | 0 | 53 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/products-by-handles/route.ts` | DELETE | 42 | 0 | 42 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/revalidate/route.ts` | DELETE | 6 | 0 | 6 | E6 : stub revalidate sans contrôle |
| `app/api/search/route.ts` | DELETE | 73 | 0 | 73 | Route API Supabase hors scénarios S01–S10 (remplacée par /api/site/* ou sans objet) |
| `app/api/track/route.ts` | DELETE | 46 | 0 | 46 | E6 : tracking analytics (Supabase) |
| `app/cart/cart-actions.tsx` | ADAPT | 41 | 9 | 7 | Boutons +/− branchés sur le panier unique, aria-label |
| `app/cart/page.tsx` | ADAPT | 208 | 81 | 119 | Lignes DTO, prix par fenêtre + rate_id, TVA/port « non qualifiés », formulaire simulation |
| `app/checkout/checkout-form.tsx` | DELETE | 321 | 0 | 321 | E6 : pages checkout legacy |
| `app/checkout/confirmation/clear-cart.tsx` | DELETE | 12 | 0 | 12 | E6 : pages checkout legacy |
| `app/checkout/confirmation/page.tsx` | DELETE | 93 | 0 | 93 | E6 : pages checkout legacy |
| `app/checkout/page.tsx` | DELETE | 64 | 0 | 64 | E6 : pages checkout legacy |
| `app/compare/compare-client.tsx` | DELETE | 221 | 0 | 221 | Comparateur (Supabase), hors scénarios |
| `app/compare/page.tsx` | DELETE | 35 | 0 | 35 | Comparateur (Supabase), hors scénarios |
| `app/contact/page.tsx` | ADAPT | 211 | 5 | 21 | Envoi désactivé (route Supabase supprimée), message honnête |
| `app/devis-express/page.tsx` | DELETE | 410 | 0 | 410 | Formulaire devis express vers route E6 supprimée |
| `app/error.tsx` | KEEP | 36 | 0 | 0 | Inchangé |
| `app/faq/page.tsx` | KEEP | 151 | 0 | 0 | Inchangé (contient des allégations TVA/livraison non qualifiées : à revoir) |
| `app/favicon.ico` | KEEP | 0 | 0 | 0 | Inchangé |
| `app/gamme-pro-intens/page.tsx` | DELETE | 148 | 0 | 148 | Landing produits Supabase hors fixture |
| `app/globals.css` | KEEP | 61 | 0 | 0 | Inchangé |
| `app/layout.tsx` | ADAPT | 80 | 20 | 47 | Providers legacy retirés, bandeau SIMULATION, instant SPIKE_NOW_UTC, noindex |
| `app/mentions-legales/page.tsx` | KEEP | 127 | 0 | 0 | Inchangé |
| `app/mes-commandes/page.tsx` | DELETE | 123 | 0 | 123 | E6 : historique commandes sans backend |
| `app/mon-devis/[orderId]/page.tsx` | DELETE | 142 | 0 | 142 | E6 : suivi devis (Supabase) |
| `app/not-found.tsx` | ADAPT | 70 | 1 | 1 | Lien devis-express -> /cart |
| `app/opengraph-image.tsx` | KEEP | 5 | 0 | 0 | Inchangé |
| `app/page.tsx` | REPLACE | 367 | 25 | 351 | Accueil S01 : catégories + familles du DTO ; sections Supabase/marketing retirées |
| `app/panier/[shareId]/page.tsx` | DELETE | 56 | 0 | 56 | E6 : panier partagé = second panier (Supabase shared_carts) |
| `app/panier/[shareId]/shared-cart-loader.tsx` | DELETE | 111 | 0 | 111 | E6 : panier partagé = second panier (Supabase shared_carts) |
| `app/product/[handle]/page.tsx` | ADAPT | 188 | 43 | 120 | Fiche famille DTO, galerie Famille puis Item, sélection par URL |
| `app/robots.ts` | KEEP | 14 | 0 | 0 | Inchangé |
| `app/search/[collection]/opengraph-image.tsx` | DELETE | 13 | 0 | 13 | OG image via getCollection Supabase |
| `app/search/[collection]/page.tsx` | ADAPT | 81 | 13 | 47 | Catégorie DTO (slug = category_key) |
| `app/search/children-wrapper.tsx` | KEEP | 14 | 0 | 0 | Inchangé |
| `app/search/layout.tsx` | ADAPT | 47 | 8 | 18 | Sidebar catégories DTO ; filtres/tri retirés |
| `app/search/loading.tsx` | KEEP | 14 | 0 | 0 | Inchangé |
| `app/search/page.tsx` | ADAPT | 54 | 17 | 31 | Recherche texte sur familles DTO |
| `app/sitemap.ts` | REPLACE | 60 | 19 | 53 | Sitemap depuis DTO |
| `app/wishlist/page.tsx` | DELETE | 207 | 0 | 207 | Liste d'envies localStorage + partage panier : second panier |
| `components/admin/analytics-widget.tsx` | DELETE | 163 | 0 | 163 | UI admin |
| `components/admin/kpi-card.tsx` | DELETE | 47 | 0 | 47 | UI admin |
| `components/admin/sidebar.tsx` | DELETE | 100 | 0 | 100 | UI admin |
| `components/admin/status-badge.tsx` | DELETE | 27 | 0 | 27 | UI admin |
| `components/carousel.tsx` | DELETE | 45 | 0 | 45 | Carrousel Supabase (getCollectionProducts) |
| `components/cart/actions.ts` | DELETE | 52 | 0 | 52 | Actions serveur no-op (interdit E4) |
| `components/cart/add-to-cart.tsx` | DELETE | 94 | 0 | 94 | Bouton legacy (action serveur no-op), non utilisé |
| `components/cart/cart-context.tsx` | REPLACE | 281 | 110 | 218 | Panier unique réécrit : lignes item + fenêtres, sélection pure, centimes |
| `components/cart/delete-item-button.tsx` | ADAPT | 38 | 10 | 26 | Action serveur retirée, bouton client |
| `components/cart/edit-item-quantity-button.tsx` | ADAPT | 61 | 12 | 39 | Action serveur retirée, bouton client |
| `components/cart/modal.tsx` | ADAPT | 250 | 89 | 149 | Lignes DTO, TTC 20 % retiré, lien panier/simulation |
| `components/cart/open-cart.tsx` | KEEP | 27 | 0 | 0 | Inchangé |
| `components/cart/share-cart-button.tsx` | DELETE | 49 | 0 | 49 | Partage panier (/api/cart/share) |
| `components/checkout/stripe-button.tsx` | DELETE | 46 | 0 | 46 | Bouton Stripe inutilisé (code mort) |
| `components/compare/compare-bar.tsx` | DELETE | 63 | 0 | 63 | Comparateur |
| `components/faq/faq-accordion.tsx` | KEEP | 74 | 0 | 0 | Inchangé |
| `components/grid/index.tsx` | KEEP | 27 | 0 | 0 | Inchangé |
| `components/grid/three-items.tsx` | DELETE | 67 | 0 | 67 | Grille vitrine Supabase |
| `components/grid/tile.tsx` | KEEP | 50 | 0 | 0 | Inchangé |
| `components/home/category-grid.tsx` | ADAPT | 34 | 6 | 6 | Type CategoryView, compte de familles |
| `components/home/featured-products.tsx` | DELETE | 25 | 0 | 25 | Bloc d'accueil Supabase/embla ou non utilisé |
| `components/home/hero.tsx` | ADAPT | 58 | 7 | 7 | Allégations non qualifiées retirées (livraison, 983 réf.) |
| `components/home/product-carousel.tsx` | DELETE | 150 | 0 | 150 | Bloc d'accueil Supabase/embla ou non utilisé |
| `components/home/testimonials-section.tsx` | DELETE | 94 | 0 | 94 | Bloc d'accueil Supabase/embla ou non utilisé |
| `components/home/trust-bar.tsx` | DELETE | 23 | 0 | 23 | Bloc d'accueil Supabase/embla ou non utilisé |
| `components/icons/logo.tsx` | KEEP | 16 | 0 | 0 | Inchangé |
| `components/label.tsx` | KEEP | 39 | 0 | 0 | Inchangé |
| `components/layout/breadcrumbs.tsx` | KEEP | 53 | 0 | 0 | Inchangé |
| `components/layout/category-sidebar.tsx` | ADAPT | 204 | 17 | 14 | Type CategoryView, aria-expanded |
| `components/layout/footer-menu.tsx` | DELETE | 46 | 0 | 46 | Menu pied de page typé Supabase, non utilisé |
| `components/layout/footer.tsx` | ADAPT | 120 | 4 | 9 | Liens catégories fixture, devis-express retiré |
| `components/layout/mobile-bottom-nav.tsx` | ADAPT | 57 | 2 | 3 | Compteur du panier unique, lien Devis -> /cart |
| `components/layout/navbar/index.tsx` | ADAPT | 119 | 9 | 21 | Menu = catégories DTO, Search conservé, LiveSearch/devis groupé retirés |
| `components/layout/navbar/mobile-menu.tsx` | ADAPT | 104 | 4 | 3 | Type Menu local, libellés FR |
| `components/layout/navbar/search.tsx` | KEEP | 43 | 0 | 0 | Inchangé |
| `components/layout/product-grid-items.tsx` | REPLACE | 101 | 43 | 86 | Carte Famille (non achetable), sans prix agrégé |
| `components/layout/promo-banner.tsx` | DELETE | 59 | 0 | 59 | Bandeau masquable (localStorage) remplacé par bandeau SIMULATION non masquable |
| `components/layout/search/catalog-filters.tsx` | DELETE | 123 | 0 | 123 | Filtres/tri Supabase (prix float, stock) sans équivalent DTO |
| `components/layout/search/collections.tsx` | DELETE | 37 | 0 | 37 | Filtres/tri Supabase (prix float, stock) sans équivalent DTO |
| `components/layout/search/filter/dropdown.tsx` | DELETE | 64 | 0 | 64 | Filtres/tri Supabase (prix float, stock) sans équivalent DTO |
| `components/layout/search/filter/index.tsx` | DELETE | 47 | 0 | 47 | Filtres/tri Supabase (prix float, stock) sans équivalent DTO |
| `components/layout/search/filter/item.tsx` | DELETE | 74 | 0 | 74 | Filtres/tri Supabase (prix float, stock) sans équivalent DTO |
| `components/loading-dots.tsx` | DELETE | 15 | 0 | 15 | Non utilisé après suppression |
| `components/logo-square.tsx` | DELETE | 23 | 0 | 23 | Non utilisé après suppression |
| `components/onboarding/welcome-modal.tsx` | DELETE | 141 | 0 | 141 | Modale d'accueil marketing, hors scénarios |
| `components/opengraph-image.tsx` | KEEP | 45 | 0 | 0 | Inchangé |
| `components/price.tsx` | ADAPT | 20 | 7 | 4 | Formatage depuis chaîne décimale, base fiscale du snapshot |
| `components/product-image.tsx` | KEEP | 37 | 0 | 0 | Inchangé |
| `components/product/compare-button.tsx` | DELETE | 37 | 0 | 37 | Comparateur / liste d'envies |
| `components/product/devis-modal.tsx` | DELETE | 190 | 0 | 190 | Modales vers /api/devis legacy ; devis via simulateur panier |
| `components/product/gallery.tsx` | KEEP | 96 | 0 | 0 | Inchangé (galerie pilotée par ?image=) |
| `components/product/mandat-modal.tsx` | DELETE | 80 | 0 | 80 | Modales vers /api/devis legacy ; devis via simulateur panier |
| `components/product/price-grid.tsx` | ADAPT | 103 | 49 | 63 | Fenêtres SELL affichées telles quelles ; calcul PBQ/économie supprimé |
| `components/product/product-badges.tsx` | DELETE | 83 | 0 | 83 | Badges promo/stock typés Supabase (pas de champ équivalent) |
| `components/product/product-card-skeleton.tsx` | DELETE | 22 | 0 | 22 | Squelette non utilisé |
| `components/product/product-description.tsx` | REPLACE | 404 | 102 | 354 | Sélection item/quantité -> selectWindow ; devis/mandat/PDF/éco retirés |
| `components/product/recently-viewed.tsx` | DELETE | 70 | 0 | 70 | Vus récemment via /api/products-by-handles |
| `components/product/variant-selector.tsx` | ADAPT | 189 | 60 | 63 | Axes DTO, valeurs absentes/interdites désactivées avec raison |
| `components/product/wishlist-button.tsx` | DELETE | 48 | 0 | 48 | Comparateur / liste d'envies |
| `components/prose.tsx` | DELETE | 15 | 0 | 15 | Rendu HTML brut (dangerouslySetInnerHTML) ; descriptions fixture en texte |
| `components/quick-order/quick-order-bar.tsx` | DELETE | 92 | 0 | 92 | Commande rapide par SKU (API Supabase) |
| `components/quote/quote-bar.tsx` | DELETE | 209 | 0 | 209 | Devis groupé localStorage = second panier |
| `components/search/live-search.tsx` | DELETE | 193 | 0 | 193 | Recherche live via /api/search (Supabase) |
| `components/ui/skeleton.tsx` | DELETE | 9 | 0 | 9 | Squelette non utilisé |
| `components/welcome-toast.tsx` | DELETE | 36 | 0 | 36 | Toast démo Vercel/Shopify |
| `lib/admin/n8n-webhooks.ts` | DELETE | 35 | 0 | 35 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/analytics/tracker.ts` | DELETE | 50 | 0 | 50 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/cart/persist.ts` | DELETE | 59 | 0 | 59 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/compare/context.tsx` | DELETE | 92 | 0 | 92 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/constants.ts` | DELETE | 51 | 0 | 51 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/email/sender.ts` | DELETE | 204 | 0 | 204 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/logger.ts` | DELETE | 25 | 0 | 25 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/pdf/product-pdf.ts` | DELETE | 186 | 0 | 186 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/quote/context.tsx` | DELETE | 121 | 0 | 121 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/rate-limit.ts` | DELETE | 27 | 0 | 27 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/recently-viewed.ts` | DELETE | 23 | 0 | 23 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/seo/score.ts` | DELETE | 80 | 0 | 80 | Fonction hors scénarios dépendant de routes/API supprimées |
| `lib/shopify/fragments/cart.ts` | DELETE | 53 | 0 | 53 | E2 : code Shopify mort |
| `lib/shopify/fragments/image.ts` | DELETE | 10 | 0 | 10 | E2 : code Shopify mort |
| `lib/shopify/fragments/product.ts` | DELETE | 64 | 0 | 64 | E2 : code Shopify mort |
| `lib/shopify/fragments/seo.ts` | DELETE | 8 | 0 | 8 | E2 : code Shopify mort |
| `lib/shopify/index.ts` | DELETE | 543 | 0 | 543 | E2 : code Shopify mort |
| `lib/shopify/mutations/cart.ts` | DELETE | 45 | 0 | 45 | E2 : code Shopify mort |
| `lib/shopify/queries/cart.ts` | DELETE | 10 | 0 | 10 | E2 : code Shopify mort |
| `lib/shopify/queries/collection.ts` | DELETE | 56 | 0 | 56 | E2 : code Shopify mort |
| `lib/shopify/queries/menu.ts` | DELETE | 10 | 0 | 10 | E2 : code Shopify mort |
| `lib/shopify/queries/page.ts` | DELETE | 41 | 0 | 41 | E2 : code Shopify mort |
| `lib/shopify/queries/product.ts` | DELETE | 36 | 0 | 36 | E2 : code Shopify mort |
| `lib/shopify/types.ts` | DELETE | 272 | 0 | 272 | E2 : code Shopify mort |
| `lib/supabase/client.ts` | DELETE | 21 | 0 | 21 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/supabase/index.ts` | DELETE | 1332 | 0 | 1332 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/supabase/index.ts.bak` | DELETE | 1186 | 0 | 1186 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/supabase/price.ts` | DELETE | 64 | 0 | 64 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/supabase/types.ts` | DELETE | 261 | 0 | 261 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/supabase/types.ts.bak` | DELETE | 186 | 0 | 186 | E2 : data layer Supabase (+ .bak), remplacé par lib/site-dto |
| `lib/type-guards.ts` | DELETE | 31 | 0 | 31 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/utils.ts` | ADAPT | 42 | 0 | 22 | validateEnvironmentVariables Supabase retiré |
| `lib/utils/eco.ts` | DELETE | 26 | 0 | 26 | Éco-participation : règle métier non qualifiée |
| `lib/validation.ts` | DELETE | 28 | 0 | 28 | Utilitaire des routes supprimées / constantes Shopify |
| `lib/wishlist/context.tsx` | DELETE | 62 | 0 | 62 | Fonction hors scénarios dépendant de routes/API supprimées |
