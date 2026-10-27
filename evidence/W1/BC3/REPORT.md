# W1 / BC3 — Boutique Famille-first, panier, devis/commande sur génération ACTIVE réelle (rapport déposé par l'orchestrateur à partir du compte rendu du builder)

Branche `build/w1-bc3-storefront`. Cycle 1 : base `70467f88`, code `d2e4a6ca` (preuves archivées dans `raw/round1_d2e4a6ca/`).
**Cycle de correction 1 (review `REVIEW_FIX_REQUIRED` à `4eba15a8`)** : merge de `build/w1-site-integration@3234d29f` (`7d7b3e73`),
**code testé `5ef5a7dc`**. Statut : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`**.
Note : l'outil du builder a refusé la création de ce fichier ; contenu initial déposé par l'orchestrateur, complété ici par le builder.
Preuves brutes : `raw/` (résumé `raw/summary.txt`, rejeu `raw/replay_gates.sh`, état `raw/git_state.txt`).

## Cycle de correction 2 (I1 D-02/D-03/D-04)
Rapport I1 : verdict `I1_FAIL` (D-02 bloquant). Commits : `1abc69e7` (D-04), `da601653` (D-02), `82e66fa5` (D-03),
`ba590775` (sonde D-02), `5f0768ce` (contre-épreuves + script de rejeu). **Tout est rejoué à `5f0768ce`** (le code n'a pas
changé depuis `ba590775`), arbre de code propre, `rm -rf node_modules .next c0/ts/dist .bc2-build .bc4-build` puis `npm ci`, build sous `env -i`.
Rejeu : `bash evidence/W1/BC3/raw/cycle2/replay_cycle2.sh` ; sorties brutes `raw/cycle2/` (résumé `raw/cycle2/summary.txt`).
Bases : `prodes_site_bc3c2_{test,smoke,limits,probe_test,ui}` ; ports 3367/3368, libres après (`ports_after.txt`, `pids.log`).

**Règle (D-02) — les routes machine ne passent pas par le proxy navigateur.** `/api/site/publish/**` (receiver BC2) et
`/api/site/events/**` (poll/ACK BC4), signées HMAC C0, sont exclues du `matcher` de `proxy.ts` (préfixe exact `(?:/|$)`).
Un proxy Next 16 qui couvre une route met son corps en tampon et le tronque à `proxyClientMaxBodySize` (10 MiB) ; le
plafond de ces routes appartient à BC2/BC4, qui le lisent en flux et le bornent eux-mêmes (32 MiB STAGE, 20 MiB média,
256 KiB contrôle). Option retenue : exclusion par `matcher`, **pas** de hausse de `proxyClientMaxBodySize` (elle aurait
fixé un second plafond, côté proxy, découplé de celui de BC2, et gardé un tampon mémoire avant l'authentification).
Ces routes n'utilisent aucun rôle du proxy : pas de CSRF (HMAC, aucun cookie), pas de HTML donc pas de CSP à nonce,
pas de page 503 ; les en-têtes de `next.config.ts` (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)
s'y appliquent toujours. BC4 ne dépendait pas du proxy : `app/api/site/events/**` délègue à `pollHttp`/`ackHttp`
(signature et bornes BC4), et `tests/bc4/http.e2e.mjs` n'affirme aucun en-tête du proxy sur ces routes (7/7 après correctif).
Toute nouvelle route machine signée doit être ajoutée à l'exclusion (commentaire en tête de `proxy.ts`).

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| D-02 correctif (`matcher` excluant `api/site/publish`, `api/site/events`) | ✅ | `proxy.ts` ; matcher compilé `raw/cycle2/proxy_matcher_compiled.txt` | `/api/site/publish.json` (route inexistante) reste sous le proxy : sans effet |
| D-02 test de non-régression : `test:storefront` section 4 (5 tests) | ✅ | `raw/cycle2/test_storefront_3367.txt` | corps construits par `tests/http/machine-payloads.mjs` à partir des fonctions C0 vendorisées |
| D-02 contre-épreuve : section 4 avec l'ANCIEN matcher | ✅ 4.1–4.4 **échouent** (201→401, 200→400, 413→400, CSP présente), 4.5 témoin passe | `raw/cycle2/storefront_s4_OLD_MATCHER_counterproof.txt` | jouée sur une copie de travail non committée (`proxy.ts` remis ensuite) |
| Envois légitimes signés : média 15 MiB, 20 MiB | ✅ 201 `STORED`, `site_media` = taille exacte | `raw/cycle2/probe_legit_machine_bodies.txt` | octets aléatoires précédés de l'en-tête PNG (pas une image décodable) |
| Envois légitimes signés : STAGE 12 MiB, 31 MiB | ✅ 200 `STAGED`, `snapshot_bytes` = taille exacte | idem | snapshot valide `F_SIMPLE_READY` gonflé de catégories racines de remplissage, `payload_sha256` et signature recalculés par C0 ; pas un catalogue réel ; non activé (pas de VERIFY/ACTIVATE à 31 MiB) |
| STAGE JSON hors contrat 12 MiB (discriminant de troncature) | ✅ 400 `SCHEMA_UNSUPPORTED` (corps entier), pas `PAYLOAD_MALFORMED` | idem | — |
| Journal « Request body exceeded » | ✅ 0 ligne | `raw/cycle2/server_logs_truncation_grep.txt` | sur les 3 serveurs lancés par le rejeu |
| BC2 `http-body-limits.mjs` (serveur réel 3367) | ✅ **22/22** (I1 : 7/22) | `raw/cycle2/http_bc2_body_limits.txt` | RSS : seuils relatifs de BC2 (rétention finale 15,2 % < 25 %) ; journal 0 → 0 ligne |
| BC2 `http-smoke.mjs` | ✅ 16/16 | `raw/cycle2/http_bc2_smoke.txt` | — |
| D-03 correctif (fiche) | ✅ | `components/product/family-buy-box.tsx` | « vérification… » annoncé à chaque saisie (région `aria-live` plus bavarde, honnête) ; lecteur d'écran réel `NOT_RUN` |
| D-03 test navigateur U10 (aperçu ralenti 250–700 ms, trace de chaque mutation) | ✅ 3 prix affichés, tous cohérents ; 5 états « vérification… » `aria-busy` | `raw/cycle2/test_ui_playwright_3368.txt`, trace `raw/cycle2/ui/U10-trace-quantite-prix.json` | oracle de test « total = quantité × unitaire » côté test seulement ; F_GMCE palier unique (aucune fixture activable à paliers multiples, F-11) : le cas 12,00/11,00 d'I1 n'est pas rejoué tel quel |
| D-03 contre-épreuve : U10 avec l'ANCIEN composant | ✅ **échoue** (« Pour 3 … soit 12,00 € », « Pour 10 … soit 12,00 € », « Pour 8 … soit 84,00 € ») | `raw/cycle2/ui_U10_OLD_BUYBOX_counterproof.txt` | copie de travail non committée |
| D-04 `test:bc2` surchargeable (`${SITE_TEST_DATABASE_URL:-…bc2_test}`) | ✅ 58/58 joué **par `npm run test:bc2`** sur `prodes_site_bc3c2_test` | `raw/cycle2/test_bc2.txt` | défaut inchangé ; commit séparé `1abc69e7` |
| `test:storefront` | ✅ **21/21**, 0 skip (16 + 5 de la section 4) | `raw/cycle2/test_storefront_3367.txt` | — |
| Recette navigateur BC3 | ✅ **10/10** (9 + U10), 0 erreur console hors 404/503 attendues | `raw/cycle2/test_ui_playwright_3368.txt`, 46 fichiers `raw/cycle2/ui/` | Chromium 148 seulement ; aucun `code=` de reçu en clair dans `raw/cycle2/` |
| `test:bc4` / `test:bc4:http` / A2 `test:http` | ✅ 73/73 / 7/7 / 88/88, 0 skip | `raw/cycle2/test_bc4.txt`, `test_bc4_http_3367.txt`, `test_http_a2_3368.txt` | — |
| `npm ci`, build `env -i`, typecheck, `c0:check` avant/après `c0:build`, `c0:test` 9/9, `c0:vendor-test` 4/4 | ✅ `C0_VENDOR_OK b88f5cdf… tree_digest=b73f1968…` | `raw/cycle2/{npm_ci,build,typecheck,c0_check,c0_build_test,c0_check_after_build,c0_vendor_test}.txt` | 0 `.env*` (`env_files.txt`) |
| `agent-ops:test`, suite Factory | ⏸️ non rejoués | — | aucun fichier concerné modifié |
| Doc de transport BC2 (`docs/SITE_TRANSPORT_STAGING.md`) | ⏸️ non modifiée | — | hors ownership BC3 ; la règle est documentée dans `proxy.ts` et ici ; proposition : une phrase « ces routes ne doivent passer par aucun proxy/middleware applicatif » côté BC2 |

Fichiers du cycle 2 : `proxy.ts`, `components/product/family-buy-box.tsx`, `tests/http/storefront.test.mjs`,
`tests/http/machine-payloads.mjs` (nouveau), `tests/http/machine-routes-probe.mjs` (nouveau), `tests/ui/storefront.ui.mjs`,
`package.json` (script `test:bc2`, autorisation orchestrateur), `evidence/W1/BC3/`. Non touchés : `c0/`, contrats, `lib/site-*`, `app/api/**`.
Non prouvé : STAGE → ACTIVATE complet d'un snapshot de 31 MiB ; frontal HTTP réel devant le SITE (sa propre limite de
corps devra être ≥ 32 MiB sur ces routes — à vérifier au déploiement) ; paliers multiples en navigateur (F-11).

## Tests et gates (SHA `5ef5a7dc`, arbre propre)
| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| `tests/http/storefront.test.mjs`, port 3361 | ✅ 16/16, 0 skip | `raw/test_storefront_3361.txt` | générations posées par le vrai receiver BC2 en HTTP ; F-06 ajouté dans 3.1/3.2 |
| Recette navigateur Playwright | ✅ **9/9** | `raw/ui_playwright_5ef5a7dc.txt`, 36 captures `raw/ui/5ef5a7dc/` | Playwright 1.61.1 + Chromium en cache local (rien téléchargé) ; Chromium seulement ; base/port par `SITE_TEST_DATABASE_URL`/`SITE_TEST_PORT` (F-13) |
| A2 `test:http`, port 3362 | ✅ 88/88 | `raw/http_a2_site_test_3362.txt` | **6 assertions et 1 ligne de table** A2 adaptées (`raw/a2_site_test_diff.txt` ; le cycle 1 disait « 9 » à tort, F-14) |
| `test:bc2` sur base BC3 | ✅ 58/58 | `raw/test_bc2_on_bc3_db.txt` | — |
| `test:bc4` sur base BC3 | ✅ **73/73** | `raw/test_bc4_on_bc3_db.txt` | au cycle 1 : 71/73, `05_stale_unsafe` **préexistant** à `70467f88` (migration BC2 `005`) ; résolu par l'adaptation BC4 `ddac0338` (UNSAFE via le pointeur) |
| `test:bc4:http`, port 3363 | ✅ **7/7** | `raw/test_bc4_http_3363.txt` | au cycle 1 : 1/7, **échec introduit par la garde CSRF de BC3** (POST BC4 sans `Content-Type`) ; résolu par l'adaptation BC4 `ddac0338` (`Content-Type`/`Origin`) |
| build `env -i`, typecheck | ✅ | `raw/build.txt`, `raw/typecheck.txt` | 0 fichier `.env*` |
| `c0:check` avant/après `c0:build`, `c0:test` 9/9, `c0:vendor-test` 4/4, `agent-ops:test` 15/15 | ✅ | `raw/` | `C0_VENDOR_OK b88f5cdf… tree_digest=b73f1968…` |
| Ports 3361–3363 libres après | ✅ | `raw/ports_after.txt` | — |
| Suite Factory | ⏸️ non exécutée | — | aucun fichier Factory ni `c0/` touché |

## Cycle de correction 1 — réponse à la review indépendante (`4eba15a8`)
| Finding | Décision | Traitement | Preuve |
|---|---|---|---|
| F-01 tests BC4 rouges | adaptés par BC4 (`ddac0338`), fusionnés | merge `3234d29f` ; tableau ci-dessus corrigé (CSRF BC3 / `05` préexistant) | `test:bc4` 73/73, `test:bc4:http` 7/7 |
| F-02 `proxy.ts`, `package.json` hors liste | ratifiés **D-W1-12** | — | — |
| F-04 code d'accès persistant | corrigé (`455359b5`) | après consultation : `history.replaceState(état du routeur, "", "/recu")`, champ vidé, `pageshow` restauré → état réinitialisé | U3 : adresse `/recu` sans fragment, champ vide, `/panier` puis « Retour » → aucun reçu, aucun `code=` |
| F-05 jeton dans des captures | corrigé | `shot()` masque toujours `[data-testid=receipt-link]` ; `U3-devis-recu.png` et `U4-commande-recue-mobile.png` (jeton en clair) **retirés** de `raw/ui/d2e4a6ca/` (dans le commit `455359b5`) ; journaux : `code=<jeton masqué>` | captures `raw/ui/5ef5a7dc/U3-devis-recu.png`, `U4-…`, `U9-commande-recue-laptop.png` masquées ; recherche `code=[…]{30,}` dans `raw/` : 0 (les fichiers retirés restent dans l'historique git déjà poussé : reçus synthétiques d'une base de test remise à zéro) |
| F-06 `?article=` silencieux | corrigé (`a9f4680d`) | retirée / remplacée (+ lien canonique) / autre famille (+ lien) / inconnue ou mal formée → avertissement `role=status`, variante par défaut annoncée comme telle | storefront 3.1 (autre famille), 3.2 (retirée, remplacée, inconnue, `<script>` échappé, clé portée = sans avertissement) ; capture `U9-avertissement-reference-retiree-laptop` |
| F-07 microcopy | corrigé (`455359b5`, `c9a843f9`) | total du reçu avec base (« HT » / « (base fiscale non précisée) » / bases différentes) ; libellés d'axe sur le reçu ; « Variante choisie » sans double deux-points ; « Ajouté au panier — … » ; page 503 : « Nous préférons ne rien afficher plutôt qu'un catalogue incomplet ou des prix non vérifiés. » | U9 (`receipt-total` « € HT ») |
| F-08 `favicon.ico` 404 | corrigé (`c9a843f9`) | `app/favicon.ico/route.ts` → 204 sans contenu, aucune icône inventée | U9 : `/favicon.ico` 204 |
| F-09 contraste non conclu par axe | corrigé (`c9a843f9`) | texte secondaire sur fond de sélection : `ink-3` (4,50:1) → `ink-2` (**6,30:1**) ; tokens DA inchangés | ratios calculés (WCAG 2.x) ci-dessous et `raw/contrast_ratios.md` |
| F-10 livrable DA incomplet | complété | état K/CT, captures recherche (1440/1024/390), 404, 410, avertissement, devis/commande/reçu à 1024 | section UX ci-dessous ; U9 |
| F-11 paliers multiples en navigateur | NOTE, non traitée | aucune fixture activable par BC2 n'a plusieurs paliers ; prouvé en mode fixture seulement (A2, `F_SELL_WINDOWS`) | `NOT_RUN` navigateur |
| F-12 `Origin` vs `Host` derrière un frontal | dette documentée | voir Dettes : le frontal DOIT transmettre l'hôte public dans `Host` | non prouvé |
| F-13 base codée en dur | corrigé (`5ef5a7dc`) | `site-setup.mjs` accepte toute base locale `prodes_site_*` (nom ou URL) ; `storefront.ui.mjs` lit `SITE_TEST_DATABASE_URL`/`SITE_TEST_PORT` | — |
| F-14 « 9 assertions » | corrigé | 6 assertions + 1 ligne de table | — |

### Ratios de contraste des paires du thème (calcul WCAG 2.x sur les tokens ; axe `color-contrast` reste « incomplet »)
| Texte | Fond | Ratio | Usage |
|---|---|---|---|
| `ink` #1A1A18 | blanc / canvas / surface / signal-subtle | 17,43 / 16,83 / 15,83 / 14,62 | texte courant, ligne choisie |
| `ink-2` #55554F | blanc / canvas / surface / signal-subtle | 7,50 / 7,25 / 6,81 / **6,30** | textes secondaires ; validité du palier retenu |
| `ink-3` #6B6B64 | blanc / canvas / surface | 5,37 / 5,18 / 4,87 | méta, en-têtes de tableau, pied de page |
| `ink-3` #6B6B64 | signal-subtle #F2E9EA | 4,50 | **plus utilisé** (seuil) |
| `signal` #7A2E3B | blanc / signal-subtle | 9,20 / 7,72 | erreurs, refus, « quantité choisie » |
| `positive` #4A6B4F | blanc | 5,99 | confirmations |
| `caution` #8A6A33 | blanc | 5,01 | bordures seulement (texte en `ink`) |
| blanc | `ink` | 17,43 | boutons primaires, options choisies |
Non mesuré : rendu réel antialiasé, états hover, images.

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

**Captures par surface** (`raw/ui/5ef5a7dc/`) : accueil, catégorie, fiche, panier en 1440/1024/390 (U2) ; recherche 1440/1024/390 (U9) ;
indisponibilité 503 en 1440/390 (U1) ; 404 et 410 (`/article` retiré) à 1024 (U9) ; avertissement de référence retirée à 1024 (U9) ;
devis (erreurs, reçu masqué) à 1440 (U3), devis / commande / commande reçue / reçu à 1024 (U9) ; commande avant confirmation et reçue
à 390 (U4) ; `CART_STALE` (U5) ; article supplanté, média manquant, aperçu 503 (U6) ; zoom 200 % (U7). Les pages 404/410 de
`/article` sont du HTML brut A2 hors gabarit DA (constat review, non modifié).

**État des tests K/CT de la DA** (plan `TEST_PLAN_ET_PROOF_MATRIX`, scénarios CT = spécifications d'essai, jamais déclarés passés
par cette recette ; K = oracles, `RECETTE_REQUIRED`) :
| Réf. | Portée site | État BC3 |
|---|---|---|
| CT09 (promo expirée après panne JARVIS : non achetable) | oui | `NOT_RUN` en navigateur : aucune fixture activable n'a de fenêtre expirée ; sélection serveur prouvée par A2 en mode fixture (`order_expired_offline`) — `RECETTE_REQUIRED` |
| CT11 (clavier sur grille interactive) | partielle (pas de grille) | équivalent site `TESTED_SYNTHETIC` (U2, U3, U7 : Tab/Entrée/Échap/flèches) ; NVDA/Windows `NOT_RUN` |
| CT12 (zoom 200 %, 390/1024/1440, pas de débordement global) | oui | `TESTED_SYNTHETIC` Chromium (zoom émulé par reflow 720 px) ; zoom navigateur réel, Windows `NOT_RUN` |
| CT13 (média absent : aucune présentation mensongère) | oui (côté site) | `TESTED_SYNTHETIC` (U6, storefront 3.3) |
| CT07 (snapshot prêt, receiver injoignable : « en attente ») | côté Factory | hors périmètre BC3 — `NOT_RUN` |
| CT01–CT06, CT08, CT10, CT14–CT16 | non (Factory/opérateur) | hors périmètre |
| K10–K13 (diffusion, ACK site, prix au checkout) | oui | `RECETTE_REQUIRED` : données synthétiques seulement, aucun ACK réel ni catalogue réel |
| K17 (gate UX) | oui | `RECETTE_REQUIRED` : aucune UAT, aucune comparaison au Workbench |

## Décisions (réversibles)
503 servi par `proxy.ts` (une lecture de génération en plus par page) ; `CART_STALE` via `F_IDENTITY` ; génération envoyée = celle dont le client a vu les prix (A2 F-10) ; code d'accès dans le fragment `#` ; clé d'idempotence réutilisée tant que le contenu est identique ; attribution `Claude Opus 5.5`. **D-W1-12** (orchestrateur) : `proxy.ts` (nom Next 16 de `middleware.ts`) et `package.json` (`test:storefront`) ratifiés dans l'ownership BC3. Cycle 1 : `?article=` non portée → avertissement (pas de redirection) ; `/favicon.ico` 204 (aucune icône).

## Fichiers
Nouveaux : `proxy.ts`, `lib/site-catalog/db-source.ts`, `app/{recherche,devis,commande,recu}/page.tsx`, `components/checkout/*`, `components/site/*`, `components/cart/{cart-summary.tsx,use-cart-preview.ts}`, `components/layout/category-menu.tsx`, `components/product/gallery.tsx`, `tests/http/storefront.test.mjs`, `tests/ui/{site-setup,storefront.ui}.mjs`. Modifiés : `lib/site-catalog/{source,catalog,page}.ts`, pages/layouts `app/`, composants, `tests/http/site.test.mjs` (6 assertions + 1 ligne de table), `package.json` (`test:storefront`). Cycle 1 : nouveau `app/favicon.ico/route.ts` ; modifiés `components/checkout/receipt-lookup.tsx`, `app/famille/[slug]/page.tsx`, `components/product/{family-buy-box,price-grid}.tsx`, `proxy.ts`, `app/error.tsx`, `tests/{http/storefront.test,ui/storefront.ui,ui/site-setup}.mjs`. Supprimé : `components/home/hero.tsx`. Non touchés : `c0/`, `lib/site-db/`, `lib/site-publish/`, `lib/site-transactions/`, `lib/site-business/`, `db/migrations/`, `app/api/site/**`.

## Dettes candidates / non prouvé / propriétaire
Dettes : double lecture de génération par page + relecture par média ; 500 si la génération disparaît entre proxy et rendu ; pas de limite de débit ; jeton de reçu en paramètre d'URL (API BC4) ; promotions futures (C0 v2) ; **hôte de confiance derrière un frontal (F-12)** : la garde CSRF compare l'hôte de `Origin` à `Host` ; un proxy frontal DOIT transmettre l'hôte public d'origine dans `Host` (ex. nginx `proxy_set_header Host $host;`, et `X-Forwarded-Proto https` pour HSTS) et ne jamais laisser le client fixer `X-Forwarded-Proto` ; sinon tous les POST du site seraient refusés en 403 (ou HSTS absent) — à vérifier au déploiement, aucun code W1 ; paliers multiples non prouvés en navigateur sur génération BC2 (F-11). (Les deux tests BC4 du cycle 1 sont adaptés.) Non prouvé : autres navigateurs, Windows, lecteurs d'écran réels, zoom navigateur réel, UAT, charge, catalogue réel, HTTPS derrière proxy, catégories secondaires, panier multi-onglets. Propriétaire : panier HT + base non précisée ; identité commerciale (logo, couleur, police, coordonnées) ; remise du code d'accès (lien unique vs e-mail) ; affichage de `PI-…` tel quel (C0 §16.3).
