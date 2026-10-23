# W1 / BC3 — Review indépendante (boutique Famille-first sur génération ACTIVE)

Reviewer indépendant (opus, contexte séparé), 2026-10-23. Je n'ai pas construit ce lot. Worktree détaché
`/Users/nico/Desktop/prodes-w1/review-bc3` à **HEAD `4eba15a8`** (rapport déposé) ; code testé **`d2e4a6ca`**
(`git diff --name-only d2e4a6ca 4eba15a8` hors `evidence/` = 0 fichier) ; base du lot `70467f88`.
Bases à moi : `prodes_site_rv_bc3` / `prodes_site_rv_bc3_test` (créées par `scripts/db/create-local.sh --recreate`,
migrations 001–005 / 010–016, `raw/db_setup.txt`). Ports 3364 (serveur manuel + storefront), 3365 (A2 + Playwright
du builder), 3366 (BC4 HTTP). Tous libres à la fin (`raw/ports_after.txt`). Aucun `pkill -f` : un seul PID lancé
à la main (86539, `next-server`), tué par `kill 86539` ; les autres serveurs ont été lancés/tués par les tests eux-mêmes.
Rien n'a été téléchargé (Playwright 1.61.1 du cache npx `e41f203b7505f1fb`, Chromium 148 `chromium-1223` du cache,
axe-core 4.10.3 de `~/Developer/curated-media/frontend/node_modules`). Aucun accès JARVIS, aucun `.env*`.
Un worktree temporaire `review-bc3-base` (détaché à `70467f88`) a servi à qualifier les échecs BC4, puis a été retiré.
Statut maximal constaté : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`** (fixtures C0 synthétiques, PostgreSQL local).

## Verdict : `REVIEW_FIX_REQUIRED`

1 finding **MAJEUR** (F-01 : BC3 casse une suite existante verte, `test:bc4:http` 7/7 → 1/7, et le rapport attribue
l'échec à BC4), 0 bloquant, 6 mineurs, 7 notes. Le cœur du lot est solide : aucune règle C0 réimplémentée dans l'UI,
états honnêtes (503 rendu serveur, `UNSAFE` → 503 et 0 écriture, 308/410/404, média altéré → 404), CSRF/XSS/redirections
résistent à mes attaques, axe 0 violation sur 11 surfaces, clavier complet, reflow 320 px et zoom CSS 200 % sans
défilement horizontal.

## 1. Rejeu (sorties brutes dans `review/raw/`, résumé `raw/summary_rv.txt`)

| Commande (SHA code `d2e4a6ca`) | Résultat brut | Fichier | Conforme au rapport ? |
|---|---|---|---|
| `npm ci` | exit 0 | `npm_ci.txt` | — |
| `env -i … npm run build` | exit 0, 22 routes, Proxy | `build.txt` | ✅ |
| `npm run typecheck` | exit 0 | `typecheck.txt` | ✅ |
| `npm run c0:check` avant/après `c0:build` | exit 0 / exit 0 | `c0_check*.txt` | ✅ |
| `npm run c0:test` / `c0:vendor-test` | 9/9 ; 4/4, 0 skip | `c0_test.txt`, `c0_vendor_test.txt` | ✅ |
| `git diff 70467f88..4eba15a8 -- c0/ lib/site-db lib/site-publish lib/site-transactions lib/site-business db/ app/api` | **0 octet** | `frozen_paths_diff.txt` | ✅ |
| `npm run test:storefront` (base `prodes_site_rv_bc3_test`, port 3364) | **16/16**, 0 skip | `test_storefront_3364.txt` | ✅ |
| `npm run test:http` A2 (port 3365) | **88/88**, 0 skip | `http_a2_site_test_3365.txt` | ✅ |
| `test:bc2` sur ma base | **58/58**, 0 skip | `test_bc2_rv_db.txt` | ✅ |
| `test:bc4` sur ma base | 71/73 (échecs 17, 18 de `05_stale_unsafe`) | `test_bc4_rv_db.txt` | ✅ chiffres |
| idem **à la base `70467f88`** | 71/73, mêmes 2 échecs | `base_70467f88_test_bc4.txt` | → **préexistant, pas BC3** |
| `test:bc4:http` (port 3366) | **1/7** (415 au lieu de 200/503) | `test_bc4_http_3366.txt` | ✅ chiffres |
| idem **à la base `70467f88`** (build `env -i` puis test) | **7/7** | `base_70467f88_test_bc4_http_3366.txt` | → **régression introduite par BC3** (F-01) |
| `test:bc4:http` avec `Content-Type` injecté (copie, diff 2 lignes) | 7/7 | `test_bc4_http_3366_with_content_type.txt`, `bc4_http_contenttype_diff_rv.txt` | ✅ |
| Playwright `tests/ui/storefront.ui.mjs` (copie : base/racine réécrites, `ui_harness_diff.txt`), port 3365 | **8/8** | `ui_playwright_rv_3365.txt`, captures `ui/d2e4a6ca-rv/` | ✅ |
| Recette navigateur complémentaire du reviewer (`harness/rv_extra.ui.mjs`) | exit 0 (constats ci-dessous) | `ui_rv_extra_3364.txt`, `ui/rv-extra/` | — |
| Suite Factory, `check_skips`, `verify_source_manifest`, `non_oubli` | `NOT_REPLAYED` | — | lot Commerce, aucun fichier Factory ni `c0/` touché |

La copie du test Playwright était nécessaire : `tests/ui/site-setup.mjs` refuse toute base autre que `prodes_site_bc3(_test)`
et `storefront.ui.mjs` code la base en dur (voir F-13). Seuls la racine, le nom de base et deux chemins d'import ont changé.

## 2. Conformité au contrat C0 (§6, §8, §10, §13) — aucune règle réimplémentée dans l'UI

| Règle | Où c'est décidé | Vérification |
|---|---|---|
| Prix et paliers = `selectPrice` à l'instant serveur (§8.6, §10.1) | `lib/site-catalog/view.ts:29-35` (A2, inchangé) ; fiche `app/famille/[slug]/page.tsx:39` | les paliers sont les `quantity_min` publiés ; aucune arithmétique |
| Prix d'une quantité / total du panier | `/api/site/cart/preview` (A2) appelé par `components/site/api.ts:34`, `family-buy-box.tsx:84,107`, `use-cart-preview.ts:37` | `grep parseFloat|BigInt|toFixed|reduce(|* quantity` dans `components/ app/` = 0 ; `format.ts:6-10` ne fait que reformater la chaîne Money |
| Montants envoyés à la commande | `checkout-flow.tsx:71-80` : `total_amount`, `unit_amount`, `line_total` recopiés de l'aperçu serveur | prix falsifié à 0.01 → 409, 0 ligne (`A02-A14…txt`) |
| Combinaisons de variantes (§8.3, pas de produit cartésien) | `variant-selector.tsx:31-32` cherche un Item **publié** ; aucune combinaison construite | axes forgés `bleu/M` → `INVALID_VARIANT` serveur |
| `CART_STALE` / `CATALOG_CHANGED` (§10.2–10.3) | serveur ; UI : `ackSequence` envoyé tel quel (`checkout-flow.tsx:71`), bannière `stale` = simple comparaison de séquences pour bloquer l'envoi (pas une règle de prix) | commande gen A après gen B → 409 `CART_STALE`, devis → 409 `CATALOG_CHANGED`, 0 ligne (`A08…txt`) |
| `UNSAFE` → refus (§10.1) | `lib/site-catalog/catalog.ts:142` et `db-source.ts:50` | pages 503, aperçu/commande/devis 503, 0 ligne (`A07…txt`) |
| Médias (§8.5) : octets revérifiés, `mime` déclaré | `db-source.ts:62-84` | octet altéré → 404 ; restauré → 200 |
| `DUPLICATE_LINE`, quantité 1…1 000 000 (§6) | serveur | doublon → 422 ; 0, 1 000 001, `"3"` → `INVALID_DATA` ; 2.5 → 400 |
| Traduction §13 sans masquer le code | `components/site/codes.ts:37` « texte (code X) » | ✅ |
| Cache | pages `no-store`, préfixes `force-dynamic` ; seuls les médias (adressés par SHA) sont `immutable` | aucun prix mis en cache au-delà d'une requête |

Nouveaux statuts SITE `CONTENT_TYPE_REFUSED` (415) et `ORIGIN_REFUSED` (403) émis par `proxy.ts` : hors table §13 mais
au niveau transport (§15 : « en-têtes exacts » `DEFERRED_FOR_PROD`) ; pas une violation C0, mais un changement du contrat
HTTP des routes BC4 (F-01).

## 3. Ownership et périmètre (`git diff --name-only 70467f88..4eba15a8`)

- 47 fichiers de code + `evidence/W1/BC3/**`. Dans l'ownership : `app/` (pages), `components/`, `lib/site-catalog/`
  (`db-source.ts` ajouté ; `source.ts` et `catalog.ts` modifiés de 2 et 17 lignes pour brancher `db` et refuser `UNSAFE`),
  `app/globals.css`, `tests/http/`, `tests/ui/`.
- **Hors ownership listé** : `proxy.ts` (nouveau, racine) et `package.json` (+1 script `test:storefront`). `proxy.ts` ne
  modifie aucun fichier de `app/api/site/**` mais change le comportement de `/api/site/{cart/preview,quote,order}` (F-02).
- `app/api/site/**`, `c0/`, `lib/site-db`, `lib/site-publish`, `lib/site-transactions`, `lib/site-business`, `db/` : intacts (0 octet).
- `components/home/hero.tsx` supprimé : **justifié** (il portait `#cc1818`, interdit comme couleur officielle par DA-03/§2.2,
  des pictogrammes emoji, et le texte « sans enregistrement », devenu faux avec BC4).
- `tests/http/site.test.mjs` (A2) : 6 assertions et 1 ligne de table modifiées (le rapport dit « 9 », F-14). Chacune est
  justifiée et **aucune n'affaiblit** : 500 + `__next_error__` → 503 + `catalog-unavailable` (plus strict) ; libellé
  « Article » → « Référence » avec `data-testid="item-ref"` (plus précis) ; E2 `DB_SOURCE_NOT_PROVIDED` →
  `SITE_DB_CONFIG_INVALID` (conséquence directe du branchement `db`).

## 4. Cas adversariaux exécutés (18 groupes, ~150 requêtes ; sorties dans `review/raw/`)

| # | Attaque | Résultat | Fichier |
|---|---|---|---|
| A01 | Base vide (aucune génération) : 10 routes + HEAD | pages 503 `text/html` rendues serveur, **0 `<script>`**, lisibles sans JS, `retry-after: 60`, CSP ; `/recu` 200 ; aperçu 503 | `A01_catalogue_absent.txt` |
| A02 | En-têtes sur `/`, `/recu`, API, média ; `x-forwarded-proto: https` | CSP à nonce sans `unsafe-inline` script, `frame-ancestors 'none'`, nosniff, `Referrer-Policy`, HSTS **seulement** si HTTPS | `A02-A14_http_adversarial.txt` |
| A03 | CSRF : 3 routes × 13 variantes (sans CT, text/plain, form, multipart, `application/json, text/plain`, Origin étranger/`null`/autre port/suffixe trompeur/userinfo, `Sec-Fetch-Site` cross-site/same-site) + 7 chemins de contournement (`/order/`, `//order`, `/./order`, `%2F`, casse, query, `%6F`) | 415/403 partout ; `/order/` et `//order` → 308 vers `/api/site/order` (re-POST toujours filtré) ; **0 ligne** (q/o/i/e = 0 avant et après) | idem |
| A04 | XSS : `<script>`, `"><img onerror>`, `javascript:` dans organisation/nom/message, via API **et** saisis au clavier dans le navigateur | 200 `RECEIVED` ; contact jamais réaffiché (reçu API sans contact) ; DOM sans `img[src=x]` ni script injecté, 0 boîte de dialogue | `A04-A06_xss_token.txt`, `ui_rv_extra_3364.txt` |
| A05 | Redirections ouvertes (`//evil`, `/\evil`, `/%2F%2Fevil`, `/article/https:%2F%2F…`, `?article=//evil`, Host/X-Forwarded-Host forgés) | toutes les `Location` sont relatives et internes ; `/article/PI-…` → `/famille/…?article=…` même avec Host forgé | `A02-A14…txt` |
| A06 | Code d'accès au reçu : journal serveur, Referer, fragment | absent du journal serveur (18 lignes, `server3364.log`), jamais dans un Referer (`/recu` est `no-referrer`, `document.referrer` vide) ; transmis à `/api/site/receipt?access_token=` (dette BC4 déclarée) ; **reste dans le fragment et l'historique** (F-04) | `ui_rv_extra_3364.txt` |
| A07 | `UNSAFE` (pointeur altéré) | 10 routes boutique 503 « Catalogue indisponible », aucun prix ; aperçu 503 `CATALOG_UNSAFE` ; commande et devis chiffré 503 ; **0 écriture** ; restauré → 200 | `A07-A09_unsafe_media.txt` |
| A08 | Identité F_IDENTITY gen_a → gen_b → gen_c | `CART_STALE`/`CATALOG_CHANGED` 409, 0 ligne ; supplanté → 308 `/article/PI-000000JVF` (relatif) ; retiré → 410 ; absent / casse basse → 404 ; aperçu `ITEM_SUPERSEDED` (+ canonique) / `ITEM_RETIRED` ; `?article=<clé retirée>` → fiche 200 sans mention (F-06) | `A08_identity_stale.txt` |
| A09 | Média altéré dans `site_media` | `/media` 404, fiche 200 ; « Image indisponible » rendu client (capture `U6-fiche-media-manquant.png`) | `A07-A09…txt` |
| A10 | 144 legacy | 36 chemins × GET/POST × (nus / cookie forgé + Bearer) → 404 (sous-test storefront 1.10 rejoué) | `test_storefront_3364.txt` |
| A11 | Secrets / JARVIS dans le build et les preuves | `.next/static` : 0 occurrence de `local-dev-only`, `JARVIS`, `/Users/nico`, `postgres://`, `TEST_SECRET` ; `.next/server` : seulement les gardes BC2 (« jamais JARVIS ») et des commentaires | `A11_secrets_grep.txt` |
| A12 | Aperçu falsifié : quantités 0 / 1 000 001 / 2.5 / `"3"`, doublon, axes forgés ou absents, clé à alphabet interdit, prix client injecté ; commande à 0.01 | refus serveur (`INVALID_DATA`, `PAYLOAD_MALFORMED`, `DUPLICATE_LINE`, `INVALID_VARIANT`, 409 `PRICE_CHANGED`), 0 ligne | `A02-A14…txt` |
| A13 | « reçue » seulement après enregistrement | `submit.ts:31` exige `200 && accepted && durable===true && receipt_ref` ; lignes vérifiées en base (U3/U4 rejoués : `site_quote_request`/`site_order` par `quote_ref`/`order_ref`) ; BC4 base coupée → 503 `DB_WRITE_FAILED` (rejoué 7/7 avec CT) | `ui/d2e4a6ca-rv/journal.txt` |
| A14 | Recherche : `<script>`, `"><img onerror>`, `javascript:`, `PI-…` en minuscules, 5 000 caractères | échappé, rendu borné à 100 ; `pi-…` trouve la Famille | `A02-A14…txt` |
| A15 | Parcours clavier complet sans clic : menu → catégorie → fiche → flèche (variante) → quantité 10 → Ajouter → Voir le panier → Demander un devis → champs → Envoyer | atteint ; titre « Demande de devis reçue » focalisé ; variante portée dans l'URL | `ui_rv_extra_3364.txt` |
| A16 | Focus visible sur **tous** les arrêts Tab (catégorie 12, fiche 18, panier 17, commande 16, reçu 14) | 0 arrêt sans indicateur | idem |
| A17 | axe-core sur 7 surfaces non couvertes par le builder (catégorie, recherche, 404, commande, commande reçue, reçu trouvé, devis panier vide) | **0 violation** partout ; `color-contrast` « incomplet » partout (F-09) | `ui/rv-extra/axe-*.json` |
| A18 | Reflow 1440/1024/390/**320** px sur 9 surfaces + zoom CSS réel 200 % à 1280 px (5 surfaces) | 0 défilement horizontal | `ui_rv_extra_3364.txt` |

## 5. Sécurité

CSP `script-src 'self' 'nonce-…' 'strict-dynamic'`, tous les `<script>` portent le nonce (0 sans nonce sur la fiche) ;
`style-src 'unsafe-inline'` déclaré. Requêtes SQL du lot paramétrées (`db-source.ts:71`). Aucun message d'erreur de base
brut (`db-source.ts:31-32`). `local-dev-only` dans `raw/` : **acceptable**, c'est le mot de passe du rôle de test local
documenté (`scripts/db/create-local.sh`, `package.json`, refus d'un hôte non local et de `jarvis`), pas un secret.
Chemins `/Users/nico/...` dans des traces de pile des preuves : chemins Mac locaux, pas JARVIS (note). Pas de limite de
débit (dette déclarée). Le contrôle `Origin` compare à l'en-tête `Host` : derrière un proxy frontal qui réécrit `Host`,
tous les POST seraient refusés en 403 (non prouvé, rapport : « HTTPS derrière proxy » non prouvé, F-12).

## 6. Qualité de preuve

- Chaque ✅ du rapport a sa sortie brute à `d2e4a6ca` (`raw/git_state.txt`) ; je les ai toutes rejouées avec les mêmes
  nombres. Statut annoncé (`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`) ≤ environnement testé : ✅.
- Écart : `raw/summary.txt` n'a pas été régénéré après la recette Playwright et le run BC4 avec `Content-Type` (les fichiers
  existent) — note.
- Qualification des échecs BC4 (`raw/bc4_failures_qualification.txt`) : correcte pour `05_stale_unsafe` (préexistant, base
  rouge aussi), **incomplète** pour `http.e2e.mjs` (F-01).
- Rapport UX de la DA : règles appliquées citées, écarts motivés (promotions futures, HT + « base non précisée »,
  « Variantes proposées », `app/loading.tsx` retiré), cas non implémentés justifiés, scénarios novice/confirmé décrits
  (automatisés, « aucune UAT humaine » dit), comparaison Workbench absente et justifiée (aucune maquette e-shop approuvée).
  Manquent : l'**état des tests K/CT** exigé par le « livrable obligatoire » de la DA ; captures `/recherche`, 404/410 et
  `/devis`/`/commande`/`/recu` à 1024 px (F-10).

## 7. Findings

### F-01 — MAJEUR — BC3 casse `test:bc4:http` (7/7 → 1/7) ; le rapport attribue l'échec à BC4
- **Reproduction** : à `70467f88`, `npm run build` puis `SITE_TEST_DATABASE_URL=…/prodes_site_rv_bc3_test SITE_TEST_PORT=3366 npm run test:bc4:http` → 7/7
  (`base_70467f88_test_bc4_http_3366.txt`). À `d2e4a6ca`, même commande → 1/7, `expected 503, actual 415`
  (`test_bc4_http_3366.txt`). Cause : `proxy.ts:24,95-97` exige `Content-Type: application/json` sur `/api/site/{quote,order}`,
  que `tests/bc4/http.e2e.mjs:67` n'envoie pas. Les garanties BC4 « base coupée → 503 `DB_WRITE_FAILED` », « configuration
  invalide → 503 », rejeu et concurrence HTTP **ne sont plus exercées** au SHA BC3 tant que la suite est rouge.
- **Pourquoi MAJEUR** : le mandat (§Tests, DONE) exige « suites BC2/BC4/A2 existantes toujours vertes » ; le rapport écrit
  « adaptation demandée à BC4 » sans dire que la suite était verte avant BC3.
- **Correction attendue** : (a) corriger `REPORT.md` : régression introduite par le CSRF de BC3, pas un défaut BC4 ; (b)
  obtenir de l'orchestrateur une adaptation coordonnée de `tests/bc4/http.e2e.mjs` (helper `http()` : `Content-Type` sur les
  POST, déjà prouvée 7/7 ici et par le builder), livrée **avant ou avec** l'intégration de BC3 — BC3 ne peut pas l'écrire
  lui-même (hors ownership) ; (c) documenter dans le contrat HTTP des routes BC4 les nouveaux refus 415 `CONTENT_TYPE_REFUSED`
  et 403 `ORIGIN_REFUSED`.

### F-02 — MINEUR — `proxy.ts` et `package.json` hors ownership listé
`proxy.ts` (racine) n'est pas dans l'ownership du mandat et agit sur des routes BC2/BC4 (CSRF) en plus des pages BC3.
Le besoin est réel (503 rendu serveur, revue A2 F-01 ; CSRF attendu par la revue). **Correction attendue** : ratification
explicite par l'orchestrateur et mention dans le rapport ; à défaut, rapatrier la partie CSRF dans un lot qui possède les routes.

### F-03 — NOTE — `05_stale_unsafe` (BC4) est rouge à la base `70467f88`, indépendamment de BC3
Le test modifie `site_generation.snapshot_bytes`, interdit par la migration BC2 `005` (`P0001 … immuables (id=1)`).
Préexistant (`base_70467f88_test_bc4.txt`) : le candidat SITE intégré est déjà rouge sur `test:bc4`. Propriétaire : BC4/intégrateur.

### F-04 — MINEUR — le code d'accès reste dans le fragment, l'historique et le champ après consultation
- **Reproduction** : ouvrir le lien `…/recu#ref=…&code=…` → reçu affiché ; `location.hash` contient toujours `code=` ; le champ
  « Code d'accès » est prérempli ; naviguer vers `/panier` puis « Retour » → le reçu se réaffiche, code dans l'URL
  (`ui_rv_extra_3364.txt`, section R1). Le code n'atteint ni le serveur dans l'adresse de page ni un Referer (bon).
- **Correction attendue** : après lecture du fragment, `history.replaceState(null, "", "/recu")` et vider le champ code
  après la consultation, pour que le code ne persiste pas dans l'historique, les favoris synchronisés ou une capture d'écran.

### F-05 — MINEUR — capture commitée avec un code d'accès en clair
`raw/ui/d2e4a6ca/U3-devis-recu.png` montre le lien complet `…#ref=QR-71b4…&code=OCj0TbX9…`, alors que le journal masque
ce même code (« <jeton masqué> »). Risque réel nul (reçu synthétique, base de test remise à zéro) mais incohérent avec la
règle « code jamais journalisé » appliquée ailleurs. **Correction attendue** : masquer `[data-testid=receipt-link]` dans
les captures (option `mask` de Playwright) ou re-capturer. (Mes propres captures `ui/d2e4a6ca-rv/U3-devis-recu.png` et
`ui/rv-extra/K1-devis-recu-clavier.png` ont le même défaut, puisqu'elles viennent du même script ; j'ai masqué le code dans
mes journaux texte.)

### F-06 — MINEUR — `?article=<clé retirée, supplantée ou d'une autre Famille>` affiche la variante par défaut sans prévenir
`GET /famille/chaise-pliante?article=PI-000000JSY` (clé retirée) → 200, variante par défaut, sans aucune mention
(`A08_identity_stale.txt`). `app/famille/[slug]/page.tsx:41` ignore la clé. Un lien partagé vers une variante retirée montre
donc une autre variante en silence (honnêteté des états). **Correction attendue** : si `article` est une clé bien formée
non portée par la Famille, rediriger vers `/article/<clé>` (qui rend déjà 308/410/404) ou afficher un avertissement.

### F-07 — MINEUR — total du reçu sans base fiscale ; microcopy à reprendre
- `receipt-lookup.tsx:109` : « Total : 36,00 € (taxes et port non calculés) », sans « HT » ni « base non précisée », alors que
  les lignes la portent (DA : base fiscale toujours explicite, jamais implicite). Les variantes du reçu sont affichées sans
  libellé d'axe (« Rouge · S »).
- `family-buy-box.tsx:145` : « Variante choisie : Couleur : Rouge · Taille : S » (double deux-points).
- Page 503 (`proxy.ts:89`) : « Aucun prix ni article n'est affiché plutôt qu'un catalogue incomplet. » (tournure maladroite ;
  ex. « Nous préférons ne rien afficher plutôt qu'un catalogue incomplet. »).
**Correction attendue** : base fiscale sur le total du reçu (même règle que `totalsNote`), libellés d'axe, reformulations.

### F-08 — NOTE — `favicon.ico` 404 sur chaque page
Erreur console à chaque chargement (`ui_rv_extra_3364.txt`) ; masquée par le filtre « 404 » du test U8. Ajouter une icône
neutre (pas de pseudo-logo, DA-03) ou une balise `<link rel="icon">` vide.

### F-09 — MINEUR — contraste non prouvé par axe (`color-contrast` « incomplet » sur toutes les surfaces)
axe ne conclut pas : « 0 violation » ne prouve pas le contraste (DA §10 : contrastes à mesurer). Mon calcul sur les tokens :
`ink-3 #6b6b64` = 5,37 sur blanc, 4,87 sur `surface`, **4,50 sur `signal-subtle`** (ligne de palier et variante choisies,
texte `xs` de validité : à la limite du seuil 4,5) ; `caution` 4,55 sur `surface`. **Correction attendue** : mesure explicite
des paires utilisées (notamment `ink-3` sur `signal-subtle`), consignée dans le rapport.

### F-10 — MINEUR — livrable DA incomplet
Manquent l'état des tests K/CT (« livrable obligatoire » de la DA : au minimum `NOT_RUN` avec la raison), des captures
de `/recherche`, des pages 404/410 et de `/devis`/`/commande`/`/recu` à 1024 px. axe a couru sur 4 surfaces seulement côté
builder (je l'ai complété sur 7). **Correction attendue** : compléter le rapport UX.

### F-11 — NOTE — aucun palier multiple sur la génération ACTIVE en navigateur
Les fixtures activables (`F_SIMPLE_READY`, `F_GMCE_VARIANTS`, `F_ESUNNY`, `F_IDENTITY`) ont un seul palier. Le passage
9 → 10 (palier qui change, ligne « quantité choisie » qui se déplace, inversion PROMO R-15) n'est prouvé qu'en mode
`fixture` par A2 (`F_SELL_WINDOWS`), pas dans le navigateur sur une génération BC2.

### F-12 — NOTE — contrôle `Origin` contre `Host` derrière un proxy frontal
`proxy.ts:79` compare l'hôte de `Origin` à `Host`. Un frontal qui réécrit `Host` (ex. `proxy_pass` sans `proxy_set_header Host`)
ferait refuser tous les POST du site en 403. À vérifier au déploiement (le rapport le classe déjà « non prouvé »).

### F-13 — NOTE — tests BC3 codés en dur sur `prodes_site_bc3_test`
`tests/ui/site-setup.mjs:9` (`DB_RE`) et `storefront.ui.mjs:18` refusent toute autre base : un reviewer ou l'intégrateur ne
peut pas rejouer la recette sur ses propres bases sans copie (cf. `ui_harness_diff.txt`). Paramétrer par
`SITE_TEST_DATABASE_URL` comme `storefront.test.mjs`.

### F-14 — NOTE — chiffres du rapport
« 9 assertions A2 adaptées » : j'en compte 6, plus 1 ligne de table (§3). Aucune n'affaiblit le test.

Hors périmètre BC3, à signaler : l'aperçu A2 répond `persistence: "NONE_UNTIL_BC4"` même avec `SITE_BUSINESS_PERSISTENCE=postgresql`
(`A01…txt`) ; les pages 404/410 de `/article` (A2) sont du HTML brut sans la mise en page DA. 500 si la génération disparaît
entre le proxy et le rendu : dette déclarée, non rejouée.

## 8. Écarts DA vérifiés

| Écart déclaré | Constat |
|---|---|
| Promotions futures non affichées (DTO, C0 v2) | confirmé, justifié (le DTO v1 ne porte pas de promesse future exploitable) |
| Panier HT + « base non précisée » additionnés avec avertissement | confirmé : total serveur, `totalsNote` l'annonce ; `REQUIRES_OWNER_DECISION` correctement consigné |
| « Variantes proposées » (tableau d'accès direct) | confirmé ; ouvert jusqu'à 8 variantes, cibles 34 px |
| `app/loading.tsx` retiré (404 réel) | confirmé : 404 HTTP réel sur Famille inconnue |
| Non déclarés (trouvés) | F-06, F-07 (base fiscale du reçu), F-08 ; la case de confirmation de commande mesure 20×20 px mais son libellé cliquable mesure 862×43 px (conforme via le label, page non mesurée par le builder) |

Identité : mot-symbole texte « PRODES », aucun `#CC1818` (`app/globals.css:6`), tokens DA-01 (`#FBFBFA`, `#1A1A18`,
lie-de-vin `#7A2E3B` pour la sélection et les blocages), focus `2px solid #1A1A18` décalé de 2 px, une seule action principale
par écran (vérifié sur les captures fiche, panier, commande).

## 9. Corrections attendues avant `REVIEW_PASS`
1. F-01 : rapport corrigé et adaptation coordonnée de `tests/bc4/http.e2e.mjs` (orchestrateur), `test:bc4:http` 7/7 sur le SHA intégré.
2. F-02 : ownership de `proxy.ts` ratifié par l'orchestrateur.
3. Recommandés (non bloquants pour le verdict) : F-04, F-05, F-06, F-07, F-09, F-10.
