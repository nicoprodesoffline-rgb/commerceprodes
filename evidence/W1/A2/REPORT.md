# W1 / A2 — Application Commerce D sur le contrat C0 gelé (rapport déposé par l'orchestrateur à partir du compte rendu du builder)

Branche `build/w1-a2-app-on-c0`, base `build/site-d-foundation@918e5437`. **SHA final `aa022a67`** (preuves seules) ; code testé à **`51704a3e`**.
Commits : `bfe7d05b` (modules `lib/site-catalog`, `lib/site-business`), `60e79833` (pages, routes, suppressions), `51704a3e` (tests, README), `aa022a67` (preuves).
Statut : **`TESTED_SYNTHETIC`** (fixtures C0 uniquement, sans base ni persistance). Rejeu depuis un état propre : `evidence/W1/A2/raw/replay_gates.sh`.
Note : le builder n'a pas pu écrire ce fichier (règle d'outillage locale) ; son contenu intégral a été remis à l'orchestrateur, qui le dépose ici sans modification de fond.

**Cycle de correction 1 (review indépendante `REVIEW_FIX_REQUIRED` à `914083e9`)** — mis à jour par le builder : code corrigé et
testé à **`7b13690d`** (commits `d771927e` F-04, `4f2fedda` F-05, `7587900f` F-02, `806b990c` F-03, `7b13690d` tests). Gates rejouées depuis
un état propre sur `7b13690d` : `raw/*.txt` (les sorties du premier passage à `51704a3e` sont archivées dans `raw/round1_51704a3e/`).
Voir la section « Cycle de correction 1 » en fin de rapport ; le tableau ci-dessous est mis à jour pour les lignes touchées.

## Résultats

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Source unique `lib/site-catalog/source.ts` (`getGeneration` / `getMedia`) | ✅ | aucune autre lecture de catalogue dans `app/`, `components/`, `lib/` | renvoie `null` ou lève `CatalogUnavailable` |
| `SITE_CATALOG_SOURCE=fixture\|db`, sans valeur = erreur explicite | ✅ | tests E1 (`SOURCE_NOT_CONFIGURED`), E2 (`DB_SOURCE_NOT_PROVIDED`) | `db` échoue tant que l'intégration n'a pas branché `lib/site-db/generation.ts` (BC2, non touché) |
| `FixtureSource` sur document gelé `c0/fixtures/documents/<SCÉNARIO>/<fichier>.json` | ✅ | scénarios A–D, F ; E3 (`snapshot_buy_leak` → `SNAPSHOT_REFUSED`) ; E4 (`../../package.json` → `FIXTURE_NAME_INVALID`) | rejoue `validateSnapshotBytes` (étapes 1–5), `mediaCodes` (8), `new Generation` ; ne vérifie pas signature/séquence/identité/couverture/hold/sûreté (BC2) |
| Catalogue refusé → indisponibilité honnête | ⚠️ | E1–E4 : pages HTTP 500 sans donnée ; API 503 `CATALOG_UNAVAILABLE`, `verdict: null` | texte « Catalogue indisponible » côté client seulement (Next 16 : page d'erreur serveur vide) ; pas de 503 pour les pages → **à traiter par BC3** |
| Vues dérivées du DTO, sans produit cartésien | ✅ | A (grille = une sélection `selectPrice` par palier publié, parité grille ↔ aperçu), B (3 Items ESUNNY), D (variante présélectionnée) | liste « combinaisons non proposées » supprimée ; plus aucun test local de date/quantité (F-04) |
| `identity_registry` : supplantée → redirection, retirée → 410, absente → 404 | ✅ | C : `PI-000000JW3` → 308 `Location: /article/PI-000000JVF` (relative) → 307 `/famille/…?article=` ; `PI-000000JSY` → 410 ; absente → 404 ; même `Location` sous `Host`/`X-Forwarded-Host` forgés (F-02) | route `app/article/[key]`, pages 404/410 hors gabarit |
| Prix uniquement par `selectPrice` côté serveur | ✅ | A ; rejeu F de 24 cas `select_price` ; l'aperçu refuse tout prix du navigateur (`INVALID_DATA`) | seul calcul : quantité × unitaire et somme, centimes BigInt — exception documentée **D-W1-08** (F-03) |
| Paliers 1–9 / 10–19 / 20+, franchissements 10 et 20 | ✅ | `F_SELL_WINDOWS.select_qty{1,9,10,19,20}_now` : `R-401-B1` 12.00, `R-401-T10` 11.00, `R-401-T20` 10.00 ; bascules DST rejouées | — |
| Panier : une ligne par (clé, axes), même variante = incrément | ✅ | Playwright au build de **`7b13690d`** (`.next/BUILD_ID` vérifié), port 3341, 2026-10-23T00:33Z : 5 puis 5 → une ligne de 10 au palier `R-401-T10`, 110,00 € (`raw/ui/round2_7b13690d/`) | Chromium, écran ordinateur seulement ; capture du premier passage (`raw/ui/*.yml`, antérieure à `51704a3e`, port 3342) conservée pour l'historique (F-07) |
| `DUPLICATE_LINE` | ✅ | aperçu 5 + 5 → 422 ; `order_duplicate_lines_tier_bypass`, `quote_duplicate_lines`, `order_duplicate_lines_ten_times_one` | — |
| `INVALID_VARIANT` combinaison interdite | ✅ | `F_ESUNNY_FORBIDDEN.select_forbidden_combination`, `order_forbidden_combination` (422) ; `order_allowed_combination` accepté | — |
| `CART_STALE` / `CATALOG_CHANGED` | ✅ | `order_stale_generation`, `quote_stale_generation`, commande d'aperçu envoyée avec séquence 6 | vrai changement de génération non reproductible avec une fixture unique (BC2/I1) |
| `PRICE_CHANGED` | ✅ | `order_falsified_amount`, `order_tier_crossed`, bout en bout falsifié, 9 → 10 au prix 1–9 | — |
| Devis non chiffré | ✅ | 5 Potelets → `PRICE_WINDOW_UNAVAILABLE`, total `null` ; `quote_unpriced_no_window` → `priced:false` ; commande → 409 | — |
| Devis/commande : verdict C0 sur octets bruts, `persistence: "NONE_UNTIL_BC4"`, `durable: false` | ✅ | `order_valid` deux fois → deux `RECEIVED`, jamais `REPLAY_SAME_RECEIPT`, aucun `receipt_ref` | non durable par construction (BC4) |
| `PAYLOAD_MALFORMED` / `INVALID_DATA` / clés de taxe | ✅ | non-JSON, BOM, clé dupliquée, UTF-8 invalide, corps > 256 Kio (lecture bornée), `order_float_amount` ; `tax_amount`, `shipping_amount`, `status`, `vat_rate` → 422 | — |
| Rejeu HTTP des cas C0 `site_business` rejouables | ✅ 56/56 | F : 18 serveurs (document, instant) comparés à `VERDICTS.json` | 10 cas exclus avec motif (sortie `# exclu` de `raw/http_site_test.txt`) : 3 `UNSAFE`, 5 registre non vide (BC4) ; `select_offset_instant` et `select_on_overlap` ont désormais leur contrepartie **négative** testée (G3 → 503 `CONFIG_INVALID`, E5 → 503 `SNAPSHOT_REFUSED` + `PRICE_WINDOW_OVERLAP` au journal) (F-08) |
| Médias : `Content-Type`, SHA-256, taille | ✅ | A, D ; média d'une autre génération / SHA inconnu / mal formé → 404 | — |
| 144 requêtes legacy → 404 | ✅ | 36 chemins × GET/POST × (sans en-têtes \| cookie forgé + Bearer) | lecture D8 confirmée par l'orchestrateur |
| `tests/http/site.test.mjs`, port `SITE_TEST_PORT` (défaut 3341) | ✅ **88/88**, 33 suites, 0 skip | `raw/http_site_test.txt` (3341) et `raw/http_site_test_port3345.txt` (`SITE_TEST_PORT=3345`, 88/88) ; ports libres après | exige `npm run build` préalable (F-06) |
| Garde `SITE_NOW_UTC` / `SITE_ENV` | ✅ | G1 : `SITE_ENV=production` → `SITE_NOW_UTC` ignoré, horloge serveur, avertissement au démarrage ; G2 : `staging` → honoré ; G3–G5 (offset, fraction, `SITE_ENV` inconnu) → API 503 `CONFIG_INVALID` + `reason`, pages 500, journal « CONFIGURATION INVALIDE » | pages en 500 (même limite que l'indisponibilité, BC3) (F-05) |
| Build sans secret (`env -i`), `typecheck`, `c0:check`/`c0:build`/`c0:test`/`c0:vendor-test`, `agent-ops:test` | ✅ | `raw/build.txt`, `raw/typecheck.txt`, `C0_VENDOR_OK` avant/après, 9/9, 4/4, 15/15 ; `git diff 918e5437 -- c0/` vide | — |

## Fichiers
Ajoutés : `lib/site-catalog/{source,fixture-source,catalog,clock,page,view}.ts`, `lib/site-business/{validate,http,client-types}.ts`, `app/article/[key]/route.ts`, `app/error.tsx`, `tests/http/site.test.mjs`.
Modifiés : `app/{layout,page,not-found}.tsx`, `app/categorie/[key]/page.tsx`, `app/famille/[slug]/page.tsx`, `app/api/site/{quote,order,cart/preview}/route.ts`, `app/media/[sha256]/route.ts`, `components/cart/*`, `components/product/*`, `components/home/{hero,category-grid}.tsx`, `components/layout/{site-header,footer}.tsx`, `lib/format.ts`, `package.json` (`test:http`), `README.md`.
Ajoutés au cycle 1 : `instrumentation.ts` (racine, contrôle d'horloge au démarrage : hors liste d'ownership, nécessaire à l'« avertissement au démarrage » de F-05).
Supprimés : `fixtures/provisional-v0/` (9 fichiers), `lib/site-dto/`, `lib/simulator/`, `spike/http-tests.mjs`. `SPIKE_NOW_UTC` → `SITE_NOW_UTC`. Non touchés : `c0/`, `lib/site-db/`, `app/api/site/publish/**`.

## Décisions (réversibles)
D1 `FixtureSource` rejoue intégrité + médias (pas seulement la forme). D2 `data_label: STAGING_FIXTURE` exigé. D3 aperçu `{lines:[{public_item_key, variant_axes, quantity}]}`, HTTP 200 dès évaluation (lignes refusées listées) — **confirmé orchestrateur**. D4 HTTP indicatif §13. D5 réponse `{contract_version, kind, persistence:"NONE_UNTIL_BC4", durable:false, catalogue_sequence, instant_utc, verdict}`. D6 indisponibilité : pages 500, API 503 `CATALOG_UNAVAILABLE` (code local, hors C0). D7 `/article/[key]` 307/308/410/404. D8 « 144 » = 36 × 2 × 2 — **confirmé orchestrateur**. D9 ligne sans prix admise au panier pour devis non chiffré, commande désactivée. D10 panier porte la séquence de ses derniers prix. D11 C0 importé depuis `c0/ts/src` par alias `@/`. D12 attribution `Claude Opus 5.5`.

## Écarts DA relevés (pour BC3)
Pas de distinction PROMO/BASE dans le DTO (plus de badge) ; base fiscale `UNQUALIFIED` affichée « (base fiscale non qualifiée) », total mixte sans « HT » ; formulaire aux 4 champs C0 ; page d'indisponibilité côté client seulement, 404/410 hors gabarit ; bandeau technique permanent ; sous-catégories a minima ; `favicon.ico` 404 ; `spike/screenshots.mjs` obsolète.

## Non prouvé
`UNSAFE` par HTTP ; idempotence (registre vide jusqu'à BC4) ; persistance/transaction/concurrence (BC4) ; source `db`, signature, activation (BC2) ; données réelles ; mobile, clavier, accessibilité, autres navigateurs ; charge ; proxy.

## Dettes candidates NON-OUBLI
Fonctions C0 revérifiant la forme du catalogue à chaque appel (coût à mesurer sur catalogue réel ; la grille appelle désormais `selectPrice` une fois par palier et par Item) ; ~~`SITE_NOW_UTC` sans garde~~ (fermé F-05) ; **exposer un calcul d'aperçu (`line_total`/total) dans C0 v2** et l'appeler depuis `previewCart` (D-W1-08) ; CSP, HSTS, contrôle `Content-Type`/`Origin` des POST (F-09, BC3/BC4) ; 503 serveur pour les pages (au lieu de 500) ; pas de limite de débit sur les POST.

## Questions
1. `REQUIRES_OWNER_DECISION` — panier mélangeant lignes HT et `UNQUALIFIED` : refuser la commande, afficher séparément, ou laisser tel quel ? (remonté au propriétaire via #31)
2. D8 et D3 : confirmés par l'orchestrateur (ci-dessus).
3. 500 côté client vs 503 serveur pour les pages : **exigence transmise à BC3** (503 servi par le serveur, page d'indisponibilité rendue côté serveur).

## Cycle de correction 1 — réponse à la review indépendante (`914083e9`)

| Finding | Décision orchestrateur | Traitement | Preuve |
|---|---|---|---|
| F-03 `line_total`/total d'aperçu calculés localement | requalifié MINEUR, **exception documentée D-W1-08** | commentaire explicite dans `previewCart` (`lib/site-business/validate.ts`) et en tête de module ; aucun changement de comportement (`806b990c`) | lecture du code ; tests A inchangés |
| F-04 `windowState` et tri local des fenêtres | à corriger | `windowState` supprimé ; `priceRows(generation, item, now)` = `selectPrice` par `quantity_min` distinct, dans l'ordre du DTO ; palier sans fenêtre → ligne « prix indisponible » portant le code C0 ; bandeau « Prix indisponible » quand aucune sélection (`d771927e`) | test A « grille = une sélection selectPrice par palier publié » : lignes `B1/1`, `T10/10`, `T20/20`, fenêtres non sélectionnées absentes, parité avec l'aperçu, Potelet palier 5 → `PRICE_WINDOW_UNAVAILABLE` |
| F-05 `SITE_NOW_UTC` sans garde | à corriger avant BC2 | `SITE_ENV` absent/`staging` → honoré ; `production` → ignoré + avertissement au démarrage (`instrumentation.ts`) ; valeur invalide ou `SITE_ENV` inconnu → `ConfigInvalid` → API 503 `CONFIG_INVALID` (`4f2fedda`) | G1–G5 |
| F-02 `Location` absolue `http://localhost:<port>` | à corriger | `Location` relative (`/article/…`, `/famille/…?article=…`) (`7587900f`) | test C : valeur exacte ; `node:http` avec `Host: boutique.prodes.example` ± `X-Forwarded-Host: evil.example` → `Location` relative, sans hôte |
| F-06 port en dur | à corriger | `SITE_TEST_PORT` (défaut 3341) | `raw/http_site_test_port3345.txt` 88/88 |
| F-07 capture UI non rattachée au SHA | refaire ou ⚠️ | refaite au build de `7b13690d` sur 3341 | `raw/ui/round2_7b13690d/` (YAML + PNG) |
| F-08 cas exclus rejouables en négatif | à ajouter | E5 `snapshot_overlap` → 503 `SNAPSHOT_REFUSED`, cause `PRICE_WINDOW_OVERLAP` au journal ; G3 `select_offset_instant` → 503 `CONFIG_INVALID` `SITE_NOW_UTC_INVALID` | `raw/http_site_test.txt` |
| F-01 indisponibilité pages 500 / texte client | MINEUR, BC3 | inchangé (⚠️ ci-dessus) | — |
| F-09 CSP/HSTS absents, POST sans contrôle `Content-Type`/`Origin` | NOTE → BC3 / intégration / BC4 (CSRF avant persistance) | listé, non traité | review RV-07, RV-11 |
| F-10 séquence de l'aperçu courant envoyée ; `lineIdentity` local sans NFC | NOTE → BC3 | listé, non traité (le serveur refuse `DUPLICATE_LINE`/`CART_STALE`) | review |
| F-11 `/panier` 200 et `CartView` non robuste à l'aperçu 503 | NOTE | listé, non traité (`codesText(preview.error_codes)` lève → `app/error.tsx`) | review |
| F-12 fichiers hors ownership (`README.md`, `lib/format.ts`, `package.json`, + `instrumentation.ts`) | NOTE | consignés (section Fichiers) | `git diff --name-only 918e5437..7b13690d` |
| F-13 `RECEIVED` visible sous `NONE_UNTIL_BC4` | NOTE → BC4 | inchangé (D5) ; BC4 ne doit jamais exposer `RECEIVED` sans commit | — |

**Exception D-W1-08 (orchestrateur).** L'aperçu de panier calcule `line_total = unit_amount × quantity` et `total_amount = Σ line_total`
en centimes BigInt avec les helpers C0 `moneyCents`/`centsToMoney`, formule identique à C0 §10.3. Ces valeurs ne font **pas** autorité :
toute commande est revalidée par `validateOrderSubmit`, qui refuse la moindre divergence (`PRICE_CHANGED`). Aucune autre arithmétique.
Dette candidate : exposer ce calcul dans C0 v2.

Gates à `7b13690d` (état propre) : `npm ci` exit 0 ; build `env -i` exit 0, 0 `.env*` ; `typecheck` exit 0 ; `c0:check` `C0_VENDOR_OK
sha=b88f5cdf… files=452 tree_digest=b73f1968…` avant et après `c0:build` ; `c0:test` 9/9 ; `c0:vendor-test` 4/4 ; `agent-ops:test` 15/15 ;
`test:http` **88/88** (0 fail, 0 skip ; 81 précédents + 7 nouveaux), port libre après ; diff `c0/` vs `918e5437` : 0 ligne.
Écart DA ajouté : la grille ne montre plus les fenêtres futures (ex. promo « à venir ») ni plusieurs périodes d'une même tranche — seulement
le prix retenu maintenant par palier, ou « prix indisponible » ; annonce d'une promo future = besoin BC3 à exprimer via C0 (pas en local).

