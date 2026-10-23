# W1 / A2 — Application Commerce D sur le contrat C0 gelé (rapport déposé par l'orchestrateur à partir du compte rendu du builder)

Branche `build/w1-a2-app-on-c0`, base `build/site-d-foundation@918e5437`. **SHA final `aa022a67`** (preuves seules) ; code testé à **`51704a3e`**.
Commits : `bfe7d05b` (modules `lib/site-catalog`, `lib/site-business`), `60e79833` (pages, routes, suppressions), `51704a3e` (tests, README), `aa022a67` (preuves).
Statut : **`TESTED_SYNTHETIC`** (fixtures C0 uniquement, sans base ni persistance). Rejeu depuis un état propre : `evidence/W1/A2/raw/replay_gates.sh`.
Note : le builder n'a pas pu écrire ce fichier (règle d'outillage locale) ; son contenu intégral a été remis à l'orchestrateur, qui le dépose ici sans modification de fond.

## Résultats

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Source unique `lib/site-catalog/source.ts` (`getGeneration` / `getMedia`) | ✅ | aucune autre lecture de catalogue dans `app/`, `components/`, `lib/` | renvoie `null` ou lève `CatalogUnavailable` |
| `SITE_CATALOG_SOURCE=fixture\|db`, sans valeur = erreur explicite | ✅ | tests E1 (`SOURCE_NOT_CONFIGURED`), E2 (`DB_SOURCE_NOT_PROVIDED`) | `db` échoue tant que l'intégration n'a pas branché `lib/site-db/generation.ts` (BC2, non touché) |
| `FixtureSource` sur document gelé `c0/fixtures/documents/<SCÉNARIO>/<fichier>.json` | ✅ | scénarios A–D, F ; E3 (`snapshot_buy_leak` → `SNAPSHOT_REFUSED`) ; E4 (`../../package.json` → `FIXTURE_NAME_INVALID`) | rejoue `validateSnapshotBytes` (étapes 1–5), `mediaCodes` (8), `new Generation` ; ne vérifie pas signature/séquence/identité/couverture/hold/sûreté (BC2) |
| Catalogue refusé → indisponibilité honnête | ⚠️ | E1–E4 : pages HTTP 500 sans donnée ; API 503 `CATALOG_UNAVAILABLE`, `verdict: null` | texte « Catalogue indisponible » côté client seulement (Next 16 : page d'erreur serveur vide) ; pas de 503 pour les pages → **à traiter par BC3** |
| Vues dérivées du DTO, sans produit cartésien | ✅ | A (fenêtres publiées, expirées masquées), B (3 Items ESUNNY), D (variante présélectionnée) | liste « combinaisons non proposées » supprimée |
| `identity_registry` : supplantée → redirection, retirée → 410, absente → 404 | ✅ | C : `PI-000000JW3` → 308 vers `PI-000000JVF` → 307 fiche ; `PI-000000JSY` → 410 ; absente → 404 | route `app/article/[key]`, pages 404/410 hors gabarit |
| Prix uniquement par `selectPrice` côté serveur | ✅ | A ; rejeu F de 24 cas `select_price` ; l'aperçu refuse tout prix du navigateur (`INVALID_DATA`) | seul calcul : quantité × unitaire et somme, centimes BigInt |
| Paliers 1–9 / 10–19 / 20+, franchissements 10 et 20 | ✅ | `F_SELL_WINDOWS.select_qty{1,9,10,19,20}_now` : `R-401-B1` 12.00, `R-401-T10` 11.00, `R-401-T20` 10.00 ; bascules DST rejouées | — |
| Panier : une ligne par (clé, axes), même variante = incrément | ✅ | Playwright : 5 puis 5 → une ligne de 10 au palier `R-401-T10` (`raw/ui/`) | Chromium, écran ordinateur seulement |
| `DUPLICATE_LINE` | ✅ | aperçu 5 + 5 → 422 ; `order_duplicate_lines_tier_bypass`, `quote_duplicate_lines`, `order_duplicate_lines_ten_times_one` | — |
| `INVALID_VARIANT` combinaison interdite | ✅ | `F_ESUNNY_FORBIDDEN.select_forbidden_combination`, `order_forbidden_combination` (422) ; `order_allowed_combination` accepté | — |
| `CART_STALE` / `CATALOG_CHANGED` | ✅ | `order_stale_generation`, `quote_stale_generation`, commande d'aperçu envoyée avec séquence 6 | vrai changement de génération non reproductible avec une fixture unique (BC2/I1) |
| `PRICE_CHANGED` | ✅ | `order_falsified_amount`, `order_tier_crossed`, bout en bout falsifié, 9 → 10 au prix 1–9 | — |
| Devis non chiffré | ✅ | 5 Potelets → `PRICE_WINDOW_UNAVAILABLE`, total `null` ; `quote_unpriced_no_window` → `priced:false` ; commande → 409 | — |
| Devis/commande : verdict C0 sur octets bruts, `persistence: "NONE_UNTIL_BC4"`, `durable: false` | ✅ | `order_valid` deux fois → deux `RECEIVED`, jamais `REPLAY_SAME_RECEIPT`, aucun `receipt_ref` | non durable par construction (BC4) |
| `PAYLOAD_MALFORMED` / `INVALID_DATA` / clés de taxe | ✅ | non-JSON, BOM, clé dupliquée, UTF-8 invalide, corps > 256 Kio (lecture bornée), `order_float_amount` ; `tax_amount`, `shipping_amount`, `status`, `vat_rate` → 422 | — |
| Rejeu HTTP des cas C0 `site_business` rejouables | ✅ 56/56 | F : 18 serveurs (document, instant) comparés à `VERDICTS.json` | 10 cas exclus avec motif (`raw/c0_replay_excluded.txt`) : 3 `UNSAFE`, 5 registre non vide (BC4), 1 offset, 1 `snapshot_overlap` |
| Médias : `Content-Type`, SHA-256, taille | ✅ | A, D ; média d'une autre génération / SHA inconnu / mal formé → 404 | — |
| 144 requêtes legacy → 404 | ✅ | 36 chemins × GET/POST × (sans en-têtes \| cookie forgé + Bearer) | lecture D8 confirmée par l'orchestrateur |
| `tests/http/site.test.mjs` port 3341 | ✅ 81/81 | `raw/http_site_test.txt` : 26 démarrages/arrêts tracés par PID | exige `npm run build` préalable |
| Build sans secret (`env -i`), `typecheck`, `c0:check`/`c0:build`/`c0:test`/`c0:vendor-test`, `agent-ops:test` | ✅ | `raw/build.txt`, `raw/typecheck.txt`, `C0_VENDOR_OK` avant/après, 9/9, 4/4, 15/15 ; `git diff 918e5437 -- c0/` vide | — |

## Fichiers
Ajoutés : `lib/site-catalog/{source,fixture-source,catalog,clock,page,view}.ts`, `lib/site-business/{validate,http,client-types}.ts`, `app/article/[key]/route.ts`, `app/error.tsx`, `tests/http/site.test.mjs`.
Modifiés : `app/{layout,page,not-found}.tsx`, `app/categorie/[key]/page.tsx`, `app/famille/[slug]/page.tsx`, `app/api/site/{quote,order,cart/preview}/route.ts`, `app/media/[sha256]/route.ts`, `components/cart/*`, `components/product/*`, `components/home/{hero,category-grid}.tsx`, `components/layout/{site-header,footer}.tsx`, `lib/format.ts`, `package.json` (`test:http`), `README.md`.
Supprimés : `fixtures/provisional-v0/` (9 fichiers), `lib/site-dto/`, `lib/simulator/`, `spike/http-tests.mjs`. `SPIKE_NOW_UTC` → `SITE_NOW_UTC`. Non touchés : `c0/`, `lib/site-db/`, `app/api/site/publish/**`.

## Décisions (réversibles)
D1 `FixtureSource` rejoue intégrité + médias (pas seulement la forme). D2 `data_label: STAGING_FIXTURE` exigé. D3 aperçu `{lines:[{public_item_key, variant_axes, quantity}]}`, HTTP 200 dès évaluation (lignes refusées listées) — **confirmé orchestrateur**. D4 HTTP indicatif §13. D5 réponse `{contract_version, kind, persistence:"NONE_UNTIL_BC4", durable:false, catalogue_sequence, instant_utc, verdict}`. D6 indisponibilité : pages 500, API 503 `CATALOG_UNAVAILABLE` (code local, hors C0). D7 `/article/[key]` 307/308/410/404. D8 « 144 » = 36 × 2 × 2 — **confirmé orchestrateur**. D9 ligne sans prix admise au panier pour devis non chiffré, commande désactivée. D10 panier porte la séquence de ses derniers prix. D11 C0 importé depuis `c0/ts/src` par alias `@/`. D12 attribution `Claude Opus 5.5`.

## Écarts DA relevés (pour BC3)
Pas de distinction PROMO/BASE dans le DTO (plus de badge) ; base fiscale `UNQUALIFIED` affichée « (base fiscale non qualifiée) », total mixte sans « HT » ; formulaire aux 4 champs C0 ; page d'indisponibilité côté client seulement, 404/410 hors gabarit ; bandeau technique permanent ; sous-catégories a minima ; `favicon.ico` 404 ; `spike/screenshots.mjs` obsolète.

## Non prouvé
`UNSAFE` par HTTP ; idempotence (registre vide jusqu'à BC4) ; persistance/transaction/concurrence (BC4) ; source `db`, signature, activation (BC2) ; données réelles ; mobile, clavier, accessibilité, autres navigateurs ; charge ; proxy.

## Dettes candidates NON-OUBLI
Fonctions C0 revérifiant la forme du catalogue à chaque appel (coût à mesurer sur catalogue réel) ; `SITE_NOW_UTC` accepté sans garde d'environnement ; 503 serveur pour les pages (au lieu de 500) ; pas de limite de débit sur les POST.

## Questions
1. `REQUIRES_OWNER_DECISION` — panier mélangeant lignes HT et `UNQUALIFIED` : refuser la commande, afficher séparément, ou laisser tel quel ? (remonté au propriétaire via #31)
2. D8 et D3 : confirmés par l'orchestrateur (ci-dessus).
3. 500 côté client vs 503 serveur pour les pages : **exigence transmise à BC3** (503 servi par le serveur, page d'indisponibilité rendue côté serveur).
