# W1 / BC3 — Boutique Famille-first, panier, devis/commande sur génération ACTIVE réelle (rapport déposé par l'orchestrateur à partir du compte rendu du builder)

Branche `build/w1-bc3-storefront`, base `build/w1-site-integration@70467f88` (A1 + A2 + BC2 + BC4). Code testé **`d2e4a6ca`**, preuves **`e16de290`**. Statut : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`**.
Note : l'outil du builder a refusé la création de ce fichier ; contenu intégral remis à l'orchestrateur et déposé sans modification de fond. Preuves brutes commitées : `raw/` (résumé `raw/summary.txt`, rejeu `raw/replay_gates.sh`).

## Tests et gates (SHA `d2e4a6ca`)
| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| `tests/http/storefront.test.mjs`, port 3361 | ✅ 16/16, 0 skip | `raw/test_storefront_3361.txt` | générations posées par le vrai receiver BC2 en HTTP |
| Recette navigateur Playwright | ✅ 8/8 | `raw/ui_playwright_d2e4a6ca.txt`, 27 captures `raw/ui/d2e4a6ca/` | Playwright 1.61.1 + Chromium en cache local (rien téléchargé) ; Chromium seulement |
| A2 `test:http`, port 3362 | ✅ 88/88 | `raw/http_a2_site_test_3362.txt` | 9 assertions A2 adaptées (`raw/a2_site_test_diff.txt`) |
| `test:bc2` sur base BC3 | ✅ 58/58 | `raw/test_bc2_on_bc3_db.txt` | — |
| `test:bc4` sur base BC3 | ⚠️ 71/73 | `raw/test_bc4_on_bc3_db.txt` | 2 échecs `05_stale_unsafe` : le test modifie `snapshot_bytes`, interdit par la migration BC2 `005` → **adaptation demandée à BC4** |
| `test:bc4:http`, port 3363 | ⚠️ 1/7 tel quel, ✅ 7/7 avec `Content-Type` | `raw/test_bc4_http_3363*.txt`, `raw/bc4_http_contenttype_diff.txt` | le test BC4 n'envoie pas `Content-Type` (CSRF BC3) → **adaptation demandée à BC4** |
| build `env -i`, typecheck | ✅ | `raw/build.txt`, `raw/typecheck.txt` | — |
| `c0:check` avant/après `c0:build`, `c0:test` 9/9, `c0:vendor-test` 4/4, `agent-ops:test` 15/15 | ✅ | `raw/` | — |
| Suite Factory | ⏸️ non exécutée | — | aucun fichier Factory ni `c0/` touché |

## Livré
| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Source catalogue `db` (`ActiveGenerationSource`, `lib/site-catalog/db-source.ts`) | ✅ | storefront 1–3 | relecture par requête ; coût 2–3 k articles `UNKNOWN` |
| Médias depuis `site_media`, octets revérifiés | ✅ | octet altéré → 404 ; « Image indisponible » | — |
| Génération `UNSAFE` → pages 503, aperçu 503 `CATALOG_UNSAFE`, 0 commande | ✅ | simulée en altérant le pointeur | — |
| Catalogue absent → **503 rendu côté serveur** (`proxy.ts`) ; `/panier` gère un aperçu 503 | ✅ | captures U1, U6 | disparition entre contrôle et rendu → 500 |
| Navigation (accueil, catégories, fil d'Ariane, recherche serveur) | ✅/⚠️ | U2 | catégories secondaires codées, non testées (aucune fixture) |
| Fiche Famille-first (image Famille, combinaisons publiées seules, `PI-…`, paliers serveur) | ✅ | ESUNNY : « sol » désactivé avec « blanc » et expliqué | — |
| Panier (une ligne par variante, total serveur, mention taxes/port) | ✅ | 3 + 2 → une ligne de 5, 65,00 € | — |
| `CART_STALE`/`CATALOG_CHANGED` réels, blocage puis reconfirmation | ✅ | storefront 3.1, U5 | via `F_IDENTITY` gen_a → gen_b (`F_SIMPLE` puis `F_GMCE` = deux séquences 1, refusé) |
| Devis et commande `RECEIVED` en base, confirmation explicite | ✅ | lignes vérifiées | — |
| Lien de consultation affiché une fois ; refus traduits avec code | ✅ | rejeu → même reçu sans jeton | code dans le fragment `#` ; l'API BC4 le reçoit en paramètre d'URL (dette BC4) |
| CSP à nonce, HSTS si HTTPS | ✅ | 0 violation CSP | `style-src 'unsafe-inline'` (React) |
| CSRF : sans `Content-Type` JSON → 415 ; `Origin` étranger/`null`/intersite → 403 | ✅ | 3 routes × 6 cas, 0 ligne écrite | pas de limite de débit (dette) |
| Formulaires → 4xx propres, HTML échappé, 144 legacy → 404 | ✅ | storefront 1.4–1.9 | — |
| Aucun secret/chemin JARVIS dans HTML/JS | ✅ | storefront 1.8 | `local-dev-only` = mot de passe de test local documenté |
| Clavier, focus, zoom 200 %, axe-core 0 violation, 0 cible < 34 px | ✅ | 4 pages | zoom émulé (720 px) ; axe-core 4.10.3 lu depuis un autre projet local |
| 1440 / 1024 / 390 | ✅ | pas de défilement horizontal | tableaux larges défilent dans leur cadre à 390 |

## Rapport UX (Design Authority)
Règles appliquées : tokens neutres, lie-de-vin réservé à la sélection/blocage, une action primaire par écran ; contrôles 34/42 px, focus 2 px, erreurs résumées + sous le champ, aucune information par la couleur seule ; microcopy française (« Famille de produits », « Variante », « Référence », « Prix de vente PRODES », base fiscale écrite) ; image Famille d'abord ; « reçue » seulement après enregistrement réel. Identité de marque non qualifiée retirée (DA-03) : mot-symbole texte « PRODES », pas de rouge `#CC1818`, pas de coordonnées non vérifiées. Écarts motivés : promotions à venir inexprimables (DTO, C0 v2) ; panier HT + « base non précisée » additionné avec avertissement ; mention « base fiscale non précisée ; taxes et port non calculés » ; liste « Variantes proposées » ; `app/loading.tsx` retiré (200 au lieu de 404) ; à 390 px total de ligne sous la quantité. Non implémenté : promotions futures, accessoires, SEO (JSON-LD du prototype inventé et injectable retiré), paiement, TVA, port, stock, compte client ; pas de comparaison Workbench (aucune maquette e-shop approuvée). Scénarios : novice (élu de mairie, mobile, variante interdite expliquée, erreurs corrigées, reçu, au clavier : U2–U3) ; confirmé (commande par `PI-…`, `CART_STALE` en cours de saisie, revérification, renvoi : U4–U5). Aucune UAT humaine.

## Décisions (réversibles)
503 servi par `proxy.ts` (une lecture de génération en plus par page) ; `CART_STALE` via `F_IDENTITY` ; génération envoyée = celle dont le client a vu les prix (A2 F-10) ; code d'accès dans le fragment `#` ; clé d'idempotence réutilisée tant que le contenu est identique ; attribution `Claude Opus 5.5`.

## Fichiers
Nouveaux : `proxy.ts`, `lib/site-catalog/db-source.ts`, `app/{recherche,devis,commande,recu}/page.tsx`, `components/checkout/*`, `components/site/*`, `components/cart/{cart-summary.tsx,use-cart-preview.ts}`, `components/layout/category-menu.tsx`, `components/product/gallery.tsx`, `tests/http/storefront.test.mjs`, `tests/ui/{site-setup,storefront.ui}.mjs`. Modifiés : `lib/site-catalog/{source,catalog,page}.ts`, pages/layouts `app/`, composants, `tests/http/site.test.mjs` (9 assertions), `package.json` (`test:storefront`). Supprimé : `components/home/hero.tsx`. Non touchés : `c0/`, `lib/site-db/`, `lib/site-publish/`, `lib/site-transactions/`, `lib/site-business/`, `db/migrations/`, `app/api/site/**`.

## Dettes candidates / non prouvé / propriétaire
Dettes : double lecture de génération par page + relecture par média ; 500 si la génération disparaît entre proxy et rendu ; pas de limite de débit ; jeton de reçu en paramètre d'URL (API BC4) ; promotions futures (C0 v2) ; deux tests BC4 à adapter. Non prouvé : autres navigateurs, Windows, lecteurs d'écran réels, zoom navigateur réel, UAT, charge, catalogue réel, HTTPS derrière proxy, catégories secondaires, panier multi-onglets. Propriétaire : panier HT + base non précisée ; identité commerciale (logo, couleur, police, coordonnées) ; remise du code d'accès (lien unique vs e-mail) ; affichage de `PI-…` tel quel (C0 §16.3).
