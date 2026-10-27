# W1 / A2 — Review indépendante (conformité C0, sécurité des routes, honnêteté des états)

Reviewer indépendant (n'a pas construit le lot). Worktree de review détaché `/Users/nico/Desktop/prodes-w1/review-a2`,
HEAD **`914083e9`** (code identique à `51704a3e` : `git diff --name-only 51704a3e 914083e9` = `evidence/` seulement), base `918e5437`.
Port de review **3342** (tous les serveurs lancés et tués par PID par mes scripts ; `lsof` final : port libre). Aucun `pkill -f`.
Node v22.23.1, npm 10.9.8, macOS, 2026-10-23T00:14Z → 00:30Z. Sorties brutes : `evidence/W1/A2/review/raw/`, scripts : `raw/scripts/`.
Statut maximal atteignable : `TESTED_SYNTHETIC` (fixtures C0 gelées, sans base, sans persistance).

**Verdict : `REVIEW_FIX_REQUIRED`** — 0 BLOQUANT, **2 MAJEUR** (F-03, F-04 : calculs/évaluations locales de fenêtres et de totaux,
classés MAJEUR par la consigne d'orchestration « toute occurrence = BLOQUANT ou MAJEUR selon l'effet » ; effet mesuré nul sur l'autorité,
voir la voie de rétrogradation), 6 MINEUR, 5 NOTE.

## 1. Rejeu (au SHA `914083e9`, depuis un état propre : `rm -rf node_modules .next c0/ts/dist`)

| Commande | Résultat brut | Fichier |
|---|---|---|
| `npm ci --no-audit --no-fund` | 49 paquets, `exit=0` | `raw/npm_ci.txt` |
| `env -i PATH HOME NEXT_TELEMETRY_DISABLED=1 npm run build` | Next 16.4.2, 10 routes `ƒ`, `exit=0` ; 0 fichier `.env*` | `raw/build.txt`, `raw/rv_secrets_grep.txt` |
| `npm run typecheck` | `exit=0` | `raw/typecheck.txt` |
| `npm run c0:check` (avant et après `c0:build`) | `C0_VENDOR_OK sha=b88f5cdf… files=452 tree_digest=b73f1968…` ×2, `exit=0` | `raw/c0_check.txt` |
| `git diff 918e5437..914083e9 -- c0/` | **0 ligne** ; `git status c0` propre | (commande dans ce rapport) |
| `npm run c0:build` / `c0:test` | `exit=0` / **9/9**, 0 fail, 0 skip | `raw/c0_build.txt`, `raw/c0_test.txt` |
| `npm run c0:vendor-test` | **4/4** (dont drift simulé → `C0_VENDOR_DRIFT`) | `raw/c0_vendor_test.txt` |
| `npm run agent-ops:test` | **15/15** | `raw/agent_ops_test.txt` |
| `test:http` (copie non commitée, seul changement `PORT = 3342`, `raw/review3342_port_patch.diff`) | **81/81**, 27 suites, 0 fail, 0 skip, 0 cancelled ; port libre après | `raw/http_site_test_3342.txt` |
| Rejeu C0 `site_business` | 66 cas au total (29 `select_price`, 27 `validate_order_submit`, 10 `validate_quote_request`) = **56 rejoués OK** + **10 exclus** (liste identique à celle du builder) | `raw/c0_business_case_count.txt`, `raw/c0_replay_ok_cases.txt`, `raw/c0_replay_excluded.txt` |

`tests/http/site.test.mjs` **n'accepte pas de port configurable** (`const PORT = 3341;` en dur) → F-06.
Suite complète du dépôt Commerce = `c0:test` + `c0:vendor-test` + `agent-ops:test` + `test:http` (aucune autre suite). Gates Factory
(`check_skips`, `verify_source_manifest`, `non_oubli`) : sans objet (dépôt Commerce, aucun import `c0_contracts` Python).

## 2. Conformité au contrat C0 (§6, §8, §10, §13)

Les verdicts viennent des fonctions C0 vendues, importées depuis `@/c0/ts/src/*` (octets vérifiés par `c0:check`) :

| Règle / code | Où | Vérifié |
|---|---|---|
| Lecture stricte §4 (UTF-8, BOM, entiers, doublons, NFC, profondeur, 256 Kio) → `PAYLOAD_MALFORMED` | `lib/site-business/validate.ts:85,91` (C0 `validateQuoteRequest`/`validateOrderSubmit`), `:144` (C0 `parseBytes` pour l'aperçu) | code + RV-08 |
| Octets bruts non re-sérialisés | `lib/site-business/http.ts:12-33` (`readBoundedBytes`) → `bytes` passé tel quel ; aucun `JSON.parse`/`stringify` côté serveur avant C0 | code + RV-08 (BOM, clé dupliquée après NFC, `l` refusés/détectés comme le C0) |
| `selectPrice` §10.1 / §8.6 (paliers, fenêtres, `INVALID_VARIANT`, `ITEM_*`, `PRICE_WINDOW_UNAVAILABLE`) | `validate.ts:163` | RV-01, RV-02, RV-13, DST |
| `DUPLICATE_LINE` R-01 | aperçu : C0 `hasDuplicateLines` (`validate.ts:157`) ; devis/commande : C0 | RV-03, RV-13 |
| `CART_STALE`, `CATALOG_CHANGED`, `PRICE_CHANGED` §10.2–10.3 | C0 `validateOrderSubmit`/`validateQuoteRequest` | RV-04 |
| Clés client de taxe/port/statut → `INVALID_DATA` | C0 (`ORDER_KEYS` exacts) | RV-05 |
| Snapshot étapes 1–5 + médias étape 8 + `Generation` | `lib/site-catalog/fixture-source.ts:49,66,75` (C0 `validateSnapshotBytes`, `mediaCodes`, `new Generation`) | RV-14 (`snapshot_overlap` → `SNAPSHOT_REFUSED: PRICE_WINDOW_OVERLAP`, document non-snapshot → `INTEGRITY_MISMATCH`) |
| Instant §6 | `lib/site-catalog/clock.ts:13` (C0 `isUtc`) | RV-15 |
| Média §8.5 (adressage SHA) | `app/media/[sha256]/route.ts:8` + carte limitée aux `media_refs` de la génération (`fixture-source.ts:70-71`) | RV-09 |
| HTTP indicatif §13 | `validate.ts:28-50` : conforme (CATALOG_UNSAFE 503 ∈ « 409/503 », OVERLAP 409 ∈ « 422/409 ») | lecture |

**Logique locale trouvée hors `c0/`** (grep `raw/rv_local_logic_grep.txt`, lecture ligne à ligne) :
- `validate.ts:161-170, 192` : `line_total = unit_amount × quantity` et `total = Σ` en centimes `BigInt` (helpers C0 `moneyCents`/`centsToMoney`) → **F-03**.
- `lib/site-catalog/catalog.ts:145-149` `windowState` (évaluation `from ≤ now < until` hors C0) et `lib/site-catalog/view.ts:21-34` (tri local des fenêtres pour l'affichage) → **F-04**.
- `components/cart/cart-provider.tsx:35-37` `lineIdentity` (identité de ligne locale, `JSON.stringify` d'entrées triées, sans NFC) : agrégation UI seulement, le serveur fait foi (`DUPLICATE_LINE` C0) → NOTE dans F-10.
- Aucun calcul de TVA, port, remise, arrondi, PBQ ; aucune logique PROMO/BASE (le DTO n'en porte pas) ; aucune comparaison de montants en `Number` ; `lib/format.ts` reformate des chaînes.
- Aucune modification de `c0/` ni de `docs/contracts/` (diff vide).

## 3. Ownership et périmètre (`git diff --name-only 918e5437..914083e9`)

Dans le périmètre : `lib/site-catalog/*` (nouveau), `lib/site-business/*` (nouveau), `app/**`, `components/**`, `tests/http/site.test.mjs`,
suppressions attendues `fixtures/provisional-v0/` (9 fichiers), `lib/site-dto/` (2), `lib/simulator/` (2, « simulateur » du mandat §6),
`spike/http-tests.mjs`, `evidence/W1/A2/**`.
Hors liste d'ownership explicite : `README.md`, `lib/format.ts`, `package.json` (ajout du script `test:http`) → F-12 (NOTE, justifiés).
Non touchés : `c0/`, `lib/site-db/` (absent de la branche), `app/api/site/publish/**` (absent ; `POST /api/site/publish*` → 404, RV-12).
`SPIKE_NOW_UTC` : absent du code (seulement un commentaire `clock.ts:4` et l'historique `spike/BC1_D_REPORT.md`, `spike/logs/`).

## 4. Cas adversariaux exécutés (≈ 190 requêtes, 36 démarrages de serveur sur 3342 hors les 26 du test HTTP, tous arrêtés par PID)

| # | Cas | Résultat observé | Fichier |
|---|---|---|---|
| RV-01 | Aperçu `F_SELL_WINDOWS/snapshot_s7` @ 2026-10-20T09:00Z, qty 1/9/10/19/20/21/1 000 000 | `R-401-B1` 12.00 ×2, `R-401-T10` 11.00 ×2, `R-401-T20` 10.00 ×3 ; 10 000 000.00 pour 1 000 000 | `rv_t1_s7_business.txt` |
| RV-01b | qty 1 000 001, 0, −1, `"10"` | ligne `INVALID_DATA` (HTTP 200, D3) | idem |
| RV-01c | qty `1.5`, `10.0`, `1e1`, 2^53+1 (octets bruts) | 400 `PAYLOAD_MALFORMED` | idem |
| RV-02 | Même clé, axes `{}` + `{coloris:rouge}` | aperçu : ligne 2 `INVALID_VARIANT`, total `null` ; commande 422 `INVALID_VARIANT` | idem |
| RV-03 | Deux lignes identiques 5+5 | aperçu et commande 422 `DUPLICATE_LINE` | idem |
| RV-04 | Commande 10 au prix 1–9 (`R-401-B1` 12.00) ; `R-401-T10` à 12.00 ; total 109.99 ; `line_total "110.0"` ; séquence 6, 8, `"7"` ; devis chiffré séquence 6 | 409 `PRICE_CHANGED` ×3 ; 422 `INVALID_DATA` ; 409 `CART_STALE` ×2 ; 422 `INVALID_DATA` ; 409 `CATALOG_CHANGED` | idem |
| RV-04b | Devis non chiffré, Potelet ×500 (aucune fenêtre) | 200 `RECEIVED`, `priced:false`, montants `null`, `persistence:NONE_UNTIL_BC4`, `durable:false`, pas de `receipt_ref` | idem |
| RV-05 | Clés `tax_amount`, `shipping_amount`, `status`, `vat_rate`, `receipt_ref`, `__proto__` dans la commande ; `unit_amount` navigateur et `__proto__` dans l'aperçu | 422 `INVALID_DATA` partout ; `variant_axes.__proto__` → ligne `INVALID_DATA` | idem |
| RV-05b | Clé minuscule, clé `PF-`, contrôle faux, 201 lignes, 0 ligne | ligne `INVALID_DATA` / 422 | idem |
| RV-06 | Même commande POSTée deux fois | 2 × `RECEIVED`, jamais `REPLAY_SAME_RECEIPT`, clés du reçu sans `receipt_ref` | idem |
| RV-07 | GET/PUT/DELETE `/api/site/order` ; POST `text/plain` ; POST vide | 405 ×3 ; traité comme JSON (400 `SCHEMA_UNSUPPORTED`) → F-09 ; 400 `PAYLOAD_MALFORMED` | idem |
| DST | 12 instants via `SITE_NOW_UTC` : 2026-03-28T22:59:59Z/23:00:00Z, 03-29T00:59:59Z/01:00:00Z, 03-29T21:59:59Z/22:00:00Z, 10-24T21:59:59Z/22:00:00Z, 10-25T00:59:59Z/01:00:00Z, 10-25T22:59:59Z/23:00:00Z | B0→P1 (9.90) à 23:00:00Z, P1 couvre 00:59:59/01:00:00, P1→B1 à 22:00:00Z ; B1→P2 (10.50) à 22:00:00Z, P2 couvre 00:59:59/01:00:00, P2→B2 à 23:00:00Z ; qty 10 reste T10 ; **l'état de grille local (`windowState`) = sélection C0 aux 12 bornes** | `rv_t2_dst.txt` |
| RV-08 | Lecture stricte : non-JSON, virgule finale, BOM, `C3 28`, surlong `C0 AF`, `\ud800`, clé dupliquée brute et après NFC, NBSP, profondeur 65, `NaN` | 400 `PAYLOAD_MALFORMED` partout ; profondeur 64 → parse OK puis 422 ; `-0` → 422 | `rv_t3_body.txt` |
| RV-08b | Taille 262 144 o (JSON + espaces) / 262 145 o ; flux chunké de 50 Mio | 200 / 400 `PAYLOAD_MALFORMED` ; flux : réponse 400 après ≈ 1,1 Mio lus, 3 ms, connexion coupée (`EPIPE`), serveur vivant | idem |
| RV-14 | `SITE_CATALOG_SOURCE` absent / `FIXTURE` / `db` ; `SITE_CATALOG_FIXTURE` vide, `../../package.json`, `/etc/passwd`, `F_SELL_WINDOWS/../../../package.json`, `%2e%2e%2f`, `\n` final, `\u0001`, inexistant, `order_valid.json`, `snapshot_overlap.json` | pages 500 sans donnée, API 503 `CATALOG_UNAVAILABLE` + `reason` (code seul, message au journal serveur), `verdict:null`, média 503, article 503 ; regex `^F_[A-Z0-9_]+\/[a-z0-9_]+\.json$` bloque toute traversée ; aucun nom de produit, montant, `rate_id`, chemin dans les réponses | `rv_t4_unavailable_injection.txt` (le 14ᵉ cas du script, `SITE_NOW_UTC` à offset, n’a pas été écrit dans ce fichier : rejoué dans `rv_t5`) |
| RV-15 | `SITE_NOW_UTC` = `…+02:00`, `2026-02-30T00:00:00Z`, `….000Z` | pages 500, API **500 corps vide** (pas l'enveloppe 503), média 200 ; journal : `SITE_NOW_UTC invalide` → F-05 | `rv_t5_site_now_utc.txt` |
| RV-09 | Média : SHA de la génération ; MAJUSCULES, 63/65 hex, média C0 hors génération (`esunny_family.png`), `..%2F`, `../`, `.png`, `%00`, nom de fichier, `/c0/fixtures/keys/test_keyring.json` ; HEAD ; POST | 200 `image/png`, SHA recalculé = demandé, `nosniff`, `immutable` ; tous les autres 404 ; HEAD 200 ; POST 405 | `rv_t6_routes_headers_legacy.txt` |
| RV-10 | `/article/[key]` : publiée, contrôle faux, minuscules, `PF-`, CRLF + `Set-Cookie`, `<script>`, `..%2F`, 5 000 caractères, U+202E, `__proto__`, `constructor`, `%00` | 307 vers `/famille/panneau-paliers?article=…` ; tous les autres 404, aucun `Set-Cookie`, aucune réflexion (gabarit à texte constant) | idem |
| RV-16 | En-têtes Host / X-Forwarded-Host forgés sur `/article/*` (`F_IDENTITY/snapshot_gen_c`) | 308 JW3→JVF, 307, 410 JSY ; Host non injectable, **mais `Location` absolue `http://localhost:3342/…`** quel que soit l'hôte → F-02 | `rv_t7_host_header.txt` |
| RV-11 | En-têtes de sécurité `/`, `/famille`, `/panier`, API | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, pas de `X-Powered-By`, pages `no-store`, API `no-store` ; **CSP et HSTS absents** → F-09 | idem |
| RV-12 | 12 POST legacy/sensibles avec cookie `admin_session=forged` + `Bearer forged.jwt.token` (`/api/admin/auth`, `/api/checkout*`, `/api/devis`, `/api/revalidate`, `/api/site/publish[/activate]`, `/api/site/receipt`, `/api/site/order/1`…) | 404 partout, aucun `Set-Cookie` ; liste des 36 chemins du test = liste du spike `918e5437:spike/http-tests.mjs` (vérifié) | idem |
| RV-13 | ESUNNY : blanc/sol sur clé blanc/murale ; ordre d'axes inversé ; axe manquant / en trop ; casse ; doublon par ordre d'axes ; doublon par échappement `l` ; page famille ; `order_forbidden_combination` / `order_allowed_combination` | `INVALID_VARIANT` ; ordre inversé accepté (`R-ESUNNY-203`) ; `INVALID_VARIANT` ×3 ; 422 `DUPLICATE_LINE` ×2 ; page : 3 Items publiés seulement, aucune mention blanc/sol ; 422 / 200 `RECEIVED` | `rv_t9_esunny.txt` |
| RV-17 | Prix affichés : `/`, 3 catégories, 2 familles | aucun montant hors fiche ; chaque montant de fiche = une fenêtre publiée avec sa validité (`HT` ou « base fiscale non qualifiée ») | `rv_t10_pages_prices.txt` |
| RV-18 | Catalogue indisponible mesuré au `curl` | `HTTP/1.1 500`, 9 373 o, `<html id="__next_error__">`, **0** occurrence visible de « Catalogue indisponible » ; le bandeau « CATALOGUE INDISPONIBLE » n'existe que dans la charge RSC échappée d'un `<script>` ; texte visible sans JS : vide (titre « PRODES — catalogue STAGING_FIXTURE ») ; `/panier` 200 → F-01, F-11 | `rv_t8_curl_unavailable.txt`, `rv_t8_home_500.html` |

## 5. Sécurité

- Secrets : 0 `.env*` (disque et `git ls-files`) ; grep `jarvis|LOCALAPPDATA|admin-prodes|/Users/nico|TEST_SECRET|BEGIN … PRIVATE|local-dev-only|tailscale|ed25519`
  sur `.next/static` (JS servi), `.next/server`, `evidence/W1/A2` (hors review) et le diff de code : **0 occurrence** (`raw/rv_secrets_grep.txt`).
  `c0/fixtures/keys/test_keyring.json` (clés de test C0) n'est servi par aucune route (RV-09 : 404).
- Variables lues : `SITE_CATALOG_SOURCE`, `SITE_CATALOG_FIXTURE`, `SITE_NOW_UTC`, et `NEXT_PUBLIC_BASE_URL` (breadcrumbs JSON-LD, défaut `https://prodes.fr`, hérité du spike).
- Injection : pas de SQL (aucune base) ; chemin de fixture fermé par regex ancrée (JS `$` sans `m` = fin de chaîne réelle, `\n` refusé, RV-14) ;
  parseur C0 à objets sans prototype, `__proto__` traité comme clé inconnue (RV-05).
- Désérialisation : uniquement C0 `parseBytes` côté serveur ; `localStorage` côté client (brouillon UX, le serveur revalide).
- Corps bornés : lecture `max + 1` octets puis `cancel()` (RV-08b). Pas de limite de débit (dette déjà listée par le builder).
- `SITE_NOW_UTC` sans garde d'environnement → F-05.

## 6. Qualité de preuve (rapport builder)

- Sorties brutes du builder au SHA `51704a3e` (`raw/env.txt` : `HEAD 51704a3e…`) ; code identique à `914083e9`. Mes rejeux reproduisent
  tous les nombres annoncés (81/81, 9/9, 4/4, 15/15, `C0_VENDOR_OK`, diff `c0/` vide, 56 + 10 exclus).
- Statut annoncé `TESTED_SYNTHETIC` = environnement testé : conforme.
- ⚠️ honnêtes : indisponibilité pages (500, texte client) correctement marquée ⚠️.
- **Écart** : la ligne « Panier : une ligne par (clé, axes), même variante = incrément » est ✅ sur la seule preuve Playwright `raw/ui/`,
  capturée à 00:03:43–00:04:02Z, **avant** le commit `51704a3e` (00:04:52Z, `git log %cI`) et sur `127.0.0.1:3342` (port de review) → F-07.
- `UNKNOWN`/non prouvés listés par le builder (UNSAFE par HTTP, idempotence, persistance, `db`, signature, mobile…) : confirmés non prouvés.

### Cas C0 exclus (point 6 du mandat de review)
Les 10 exclusions et leurs motifs sont exacts. Rejouabilité :
- 5 « registre non vide » (`*_double_post*`, `*_same_key_other_payload`, `order_replay_lines_reordered`) : non rejouables sans persistance (BC4) ;
  leur contrepartie honnête (2ᵉ POST ≠ `REPLAY_SAME_RECEIPT`) est testée par le builder et par RV-06.
- 3 `UNSAFE` : non rejouables, `FixtureSource` force `ACTIVE` (`fixture-source.ts:73`) ; rejouables seulement avec un réglage de statut de test (non demandé par le mandat).
- `select_on_overlap` et `select_offset_instant` : **rejouables sous forme négative** (pas avec l'oracle C0, inatteignable par HTTP) — je les ai rejoués :
  `snapshot_overlap` → 503 `SNAPSHOT_REFUSED: PRICE_WINDOW_OVERLAP` (RV-14), instant à offset → 500 (RV-15). Ils devraient figurer dans `tests/http` → F-08.

## 7. Findings

| ID | Sévérité | Constat | Reproduction | Correction attendue |
|---|---|---|---|---|
| F-01 | MINEUR | Catalogue indisponible : pages **HTTP 500** (pas 503) et **aucun message rendu par le serveur** ; le texte « Catalogue indisponible » (`app/error.tsx`) et le bandeau ne s'affichent qu'après exécution JS ; sans JS : page vide titrée « PRODES — catalogue STAGING_FIXTURE ». Honnête sur les données (aucune servie), pas sur l'état HTTP. Déjà ⚠️ et transmis à BC3. | `env -i … next start -p 3342` sans `SITE_CATALOG_SOURCE` ; `curl -D - http://127.0.0.1:3342/` (`raw/rv_t8_*`) | 503 + page d'indisponibilité rendue côté serveur (BC3, consigné) ; titre neutre quand le catalogue est indisponible. |
| F-02 | MINEUR | `/article/[key]` construit `Location` à partir de `req.url` : redirections 307/308 **absolues vers `http://localhost:<port>`** quel que soit l'hôte public ; derrière un proxy/domaine, la redirection permanente (308, mise en cache) des clés SUPERSEDED pointe vers localhost. Non injectable par Host/X-Forwarded-Host (testé). | `rv_t7_host_header.txt` | `Location` relative (`/article/…`, `/famille/…`) ou origine publique configurée ; test qui vérifie la valeur exacte de `Location`. À corriger avant toute exposition. |
| F-03 | **MAJEUR** (consigne) | Calcul local de `line_total = unit_amount × quantity` et `total_amount = Σ` dans l'aperçu (`lib/site-business/validate.ts:161-170,192`), réplique exacte de `c0/ts/src/business.ts:281-314` hors `c0/`. Le mandat dit « aucun calcul local » (§3). **Effet mesuré : aucune autorité** — la commande revalide tout et refuse la moindre divergence (`PRICE_CHANGED`, RV-04) ; seul risque : un total d'aperçu > 999 999 999.99 affiché mais non soumissible (inatteignable avec les fixtures). | lecture ; RV-01 (totaux) ; RV-04 | Décision d'orchestration : soit **exception documentée** (multiplication/somme en centimes via helpers C0, contrat §10.3) → rétrogradable en MINEUR, soit helper exporté par une **C0 v2** (`lineTotal`/`orderTotals`) appelé par l'aperçu. Le builder ne peut pas le corriger seul sans toucher `c0/`. |
| F-04 | **MAJEUR** (consigne) | Évaluation locale de fenêtre `from ≤ now < until` (`lib/site-catalog/catalog.ts:145-149`, `windowState`) qui décide quelles lignes de grille sont « actives » (montant en rouge) et l'affichage du bandeau « Prix indisponible » ; tri local des fenêtres pour l'affichage (`view.ts:23`). Duplication de la partie temporelle de §8.6 hors C0. **Effet mesuré : nul** (identique à `selectPrice` aux 12 bornes DST, RV DST ; aucune incidence sur prix retenu, panier ou commande). | `rv_t2_dst.txt` | Marquer la ligne active par la sélection C0 (`selectPrice(…, w.quantity_min, now).rate_id === w.rate_id`) et réserver la comparaison d'instants au seul libellé « À venir/expirée », ou exception documentée par l'orchestrateur ; ajouter un test de parité grille ↔ `selectPrice`. |
| F-05 | MINEUR | `SITE_NOW_UTC` accepté **sans garde d'environnement** : il remplace l'horloge serveur pour la sélection de prix **et** la validation des commandes (§8.4 : `now_utc` = horloge serveur), quelle que soit la source (y compris `db` future) ; une valeur oubliée en production figerait les prix (promo expirée encore vendue). Valeur invalide : API **500 corps vide** au lieu de l'enveloppe 503. Risque nul aujourd'hui (fixtures seulement), réel dès BC2. | `rv_t5_site_now_utc.txt` | Refuser `SITE_NOW_UTC` hors `SITE_CATALOG_SOURCE=fixture` (ou drapeau de test explicite), et répondre 503 `CATALOG_UNAVAILABLE`-like en cas de valeur invalide. Pré-requis d'intégration BC2. |
| F-06 | MINEUR | Port des tests HTTP **en dur** (`tests/http/site.test.mjs:15`, 3341) : pas de rejeu parallèle ni de review sur un port propre sans patcher le fichier. | `raw/review3342_port_patch.diff` | `const PORT = Number(process.env.SITE_TEST_PORT ?? 3341)`. |
| F-07 | MINEUR | Preuve UI (agrégation 5 + 5 → une ligne de 10 au palier `R-401-T10`) **non rattachée à un SHA** : capture antérieure au commit `51704a3e`, sur le port 3342 (attribué au reviewer). Le ✅ correspondant est donc ⚠️. La règle serveur (`DUPLICATE_LINE`) est, elle, prouvée. | `raw/ui/*` horodatages vs `git log -1 --format=%cI 51704a3e` | Rejouer la capture au SHA final, ou passer la ligne à ⚠️ dans le rapport. |
| F-08 | MINEUR | Les cas exclus `select_on_overlap` et `select_offset_instant` ont une contrepartie HTTP rejouable (catalogue refusé → 503 ; instant invalide → refus) non couverte par `tests/http`. | RV-14 (overlap), RV-15 | Ajouter deux tests négatifs (après F-05 pour fixer le code attendu de l'instant invalide). |
| F-09 | NOTE | Pas de contrôle `Content-Type`/`Origin` sur les POST (un POST `text/plain` cross-site est traité) ; CSP et HSTS absents. Sans persistance ni cookie : aucun effet aujourd'hui. | RV-07, RV-11 | À exiger par BC4 avant toute persistance (CSRF) ; CSP/HSTS à BC3/déploiement. |
| F-10 | NOTE | Le panier envoie la séquence de l'**aperçu courant**, pas celle de l'ajout ; le bandeau « catalogue changé » n'empêche pas la commande. Conforme (les prix soumis = prix affichés, le serveur refuse `CART_STALE` si la génération change entre aperçu et soumission) ; CE-T12 avec un vrai changement de génération non prouvé (BC2/I1, déjà déclaré). `lineIdentity` local sans NFC : divergence possible seulement par `localStorage` falsifié, le serveur refuse alors `DUPLICATE_LINE`. | lecture `components/cart/*` | — (à reprendre BC3). |
| F-11 | NOTE (`CODE_CONFIRMED`, non exécuté) | `/panier` reste 200 quand le catalogue est indisponible ; l'aperçu 503 ne porte ni `lines` ni `error_codes` → `codesText(preview.error_codes)` / `preview.lines.length` lèvent côté client (`cart-view.tsx:123,137`) ; l'erreur tombe dans `app/error.tsx` (« Catalogue indisponible ») : issue honnête par accident. | lecture | Traiter explicitement la réponse 503 dans `CartView`. |
| F-12 | NOTE | Fichiers hors liste d'ownership : `README.md`, `lib/format.ts`, `package.json` (`test:http`). Justifiés, sans effet sur `c0/`. | `git diff --name-only 918e5437..914083e9` | Consigner dans le rapport. |
| F-13 | NOTE | La réponse porte `verdict.outcome: "RECEIVED"` et `verdict.receipt.status: "RECEIVED"` (+ `request_fingerprint`) sous l'enveloppe `persistence: "NONE_UNTIL_BC4"`, `durable: false`, sans `receipt_ref` : conforme D5/mandat, mais un client naïf peut lire « RECEIVED ». | RV-04b, RV-06 | BC4 : ne jamais exposer `RECEIVED` sans commit ; garder l'enveloppe. |

## 8. Verdict

**`REVIEW_FIX_REQUIRED`** — à lever :
- **F-03** et **F-04** (MAJEUR par la consigne d'orchestration) : correction de code (F-04, faisable sans toucher `c0/`) ou **décision
  d'orchestration** consignée qui les accepte comme exceptions d'affichage sans autorité (effet mesuré nul) → rétrogradables en MINEUR,
  le verdict deviendrait alors `REVIEW_PASS` avec mineurs ouverts.
- Mineurs à suivre (non bloquants pour `REVIEW_PASS`) : F-01 (BC3), F-02, F-05 (pré-requis BC2), F-06, F-07, F-08.

Ce que cette review ne prouve pas : comportement `UNSAFE` par HTTP, idempotence/persistance/concurrence (BC4), source `db`, signature et
activation (BC2), données réelles, navigateurs/mobile/accessibilité (aucune exécution navigateur par le reviewer), charge, proxy réel.
