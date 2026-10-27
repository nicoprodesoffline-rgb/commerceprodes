# W1 / BC4 — Review indépendante (concurrence, idempotence, intégrité transactionnelle, sécurité)

- Reviewer : opus, contexte séparé, n'a pas construit le lot. Worktree détaché `/Users/nico/Desktop/prodes-w1/review-bc4`,
  HEAD **`0d21981e`** (SHA final ; code identique à `3ebbb48d` : `git diff --name-only 3ebbb48d..0d21981e` = `evidence/` seulement).
- Base : BC2 `a9dede14` + fusion A2 `aa022a67` en `09c0168f`.
- Bases du reviewer : `prodes_site_rv_bc4` (dev) / `prodes_site_rv_bc4_test` (tests), PostgreSQL 18.6 local port 54318.
  Port HTTP **3352** uniquement ; serveurs lancés et arrêtés par les tests du reviewer (PID 89880, 89890, 89895, 1418/1884, 1526/2050,
  1529/2068 + ceux du rejeu A2), port libre vérifié après coup (`lsof` vide). Aucun `pkill -f`, aucune action JARVIS, aucun `.env*`.
- Sorties brutes : `evidence/W1/BC4/review/raw/` ; cas adversariaux exécutables : `evidence/W1/BC4/review/adv/*.test.mjs`
  (non commités, aucun fichier du builder modifié — `git status` : seul `evidence/W1/BC4/review/` non suivi).
- Variables réelles (lues dans le code) : `SITE_BUSINESS_PERSISTENCE` (`postgresql` | absente), `SITE_DATABASE_URL`, `SITE_KEYRING_PATH`,
  `SITE_NOW_UTC` (horloge figée de test), `SITE_ENV` (BC2). `SITE_ACK_KEY_ID` n'est pas lu par BC4 (BC2). **`SITE_CATALOG_SOURCE=db`
  n'existe pas encore** côté pages A2 (`lib/site-catalog/source.ts:61-67` lève `DB_SOURCE_NOT_PROVIDED`) — voir F-11.

## 1. Rejeu (au SHA `0d21981e`)

| Commande | Résultat brut | Fichier |
|---|---|---|
| `npm ci` | exit 0, 0 vulnérabilité | `raw/npm_ci.txt` |
| `scripts/db/create-local.sh prodes_site_rv_bc4 prodes_site_rv_bc4_test` | 2 bases créées | `raw/create_local.txt` |
| `node scripts/db/migrate.mjs` ×2 (dev) | 1er : `applied=10` ; 2e : 10 × `skip`, `applied=0` (idempotent) | `raw/migrate_1.txt`, `raw/migrate_2_idempotent.txt` |
| `npm run c0:check` | `C0_VENDOR_OK sha=b88f5cdf… files=452 tree_digest=b73f1968…`, exit 0 | `raw/c0_check.txt` |
| `git diff a9dede14..0d21981e -- c0/ lib/site-db lib/site-publish db/migrations/00*` | **non vide** : `c0/C0_SOURCE.json`, `c0/README.md` (59 lignes) issus du commit A2 `156bc548` (re-vente C0 `C0_FROZEN`, arbres `src/test/fixtures/python` identiques). Diff des commits BC4 propres `09c0168f..0d21981e` sur ces chemins : **0 ligne** | `raw/vendor_diff.txt` |
| `npm run typecheck` | exit 0 | `raw/typecheck.txt` |
| `env -i PATH HOME npm run build` | exit 0, routes `/api/site/{quote,order,receipt,events,events/ack}` dynamiques | `raw/build_env_i.txt` |
| BC4 (`bc2:build && bc4:build && node --test --test-concurrency=1 tests/bc4/*.test.mjs`, base `_rv_bc4_test`) | **70 tests, 70 pass, 0 fail, 0 skip**, exit 0 | `raw/test_bc4.txt` |
| BC4 HTTP (copie `PORT 3351→3352`, seule ligne changée) | **7/7**, 0 skip, exit 0 | `raw/test_bc4_http_3352.txt`, `raw/http_port_diff.txt` |
| BC2 `tests/bc2/*.test.mjs` sur `_rv_bc4_test` | **50/50**, 0 skip | `raw/test_bc2.txt` |
| A2 `tests/http/site.test.mjs` (copie `PORT 3341→3352`) | **81/81**, 0 skip | `raw/test_http_a2_3352.txt`, `raw/http_a2_port_diff.txt` |
| `npm run c0:vendor-test` / `c0:build && c0:test` | 4/4 / 9/9 | `raw/c0_vendor_test.txt`, `raw/c0_ts_test.txt` |
| Suite Factory, `check_skips`, `verify_source_manifest`, `non_oubli` | `NOT_REPLAYED` (lot Commerce, aucun fichier Factory touché) | — |

Note : `npm run test:bc4` / `test:bc4:http` **littéraux** n'ont pas été lancés : ils codent en dur `prodes_site_bc4_test` (base du
builder) et le port 3351 ; j'ai rejoué la même commande avec `SITE_TEST_DATABASE_URL` vers ma base (F-04).

## 2. Conformité au contrat (lecture ligne à ligne de `lib/site-transactions/`)

| Règle C0 | Où | Verdict |
|---|---|---|
| Verdict devis/commande = `validateQuoteRequest`/`validateOrderSubmit` sur les **octets bruts** | `http.ts:49-50` (`readBoundedBytes` → `submitBusiness`), `business.ts:56-60,320,341` | ✅ aucune re-sérialisation ; `parseBytes` ré-utilisé seulement pour `contact`/`message`/`idempotency_key` (`:324`) |
| Lignes figées, `line_total`, `total_amount`, `request_fingerprint` = sortie C0 | `business.ts:194-221` (commande), `237-268` (devis) depuis `receipt["lines"]` | ✅ ADV-07 : lignes en base = `oracle.receipt.lines` octet pour octet (JSON) ; empreinte = `requestFingerprint` C0 |
| Arithmétique monétaire | `business.ts:185-198,211-213` : `moneyCents` C0 → `BigInt` ; contrôle défensif (lève → 503), aucune décision | ✅ aucun `Number` sur un montant ; `BigInt(quantity)` sur l'entier validé par C0 |
| Tri local des lignes | aucun ; `line_no` = ordre C0 | ✅ |
| `offer_price_version_public` du devis | `business.ts:252-260` : `selectPrice` C0, égalité `rate_id`/`unit_amount` exigée | ✅ (décision 6 du builder, sans règle locale) |
| Idempotence §10.4 (avant génération, réordonnancement) | registre relu (`:319`), C0 tranche ; conflit d'unicité → relecture + **nouveau verdict C0** (`:337-351`) | ✅ ADV-01, ADV-04a (rejeu après nouvelle activation → reçu d'origine), builder F3/F12 |
| Événement §11.1 : `payload_digest`, `event_bytes` | `business.ts:134-183` : `payloadDigest`, `canonicalBytes`, garde `validateEvent(bytes,[])==APPLY` | ✅ ADV-09 (base64 → sha, canonique, digest recalculé, APPLY puis `EVENT_DUPLICATE_NOOP`) |
| Reçu §10.5 | `receipt.ts:28-40` : même requête SQL que la réf existe ou non, `lookupReceipt` C0 (SHA-256 + `timingSafeEqual`) | ✅ ADV-13 |
| Poll §11.3 | `events.ts:66` (`keyHasScope` + `verify` C0), `:82` `validatePollRequest` C0 | ✅ ADV-12, H5 |
| HTTP §13 | `common.ts:40-66` | ✅ valeurs conformes (`CATALOG_UNSAFE` 503 ∈ « 409 / 503 ») ; codes mixtes → 409 (comme A2) ; table **dupliquée** (F-05) |
| Modification de `c0/` ou des contrats | — | ✅ aucune par BC4 (cf. §1) |

Aucune réimplémentation d'une règle C0 trouvée.

## 3. Transaction (ordre réel, vérifié dans le code et par injection)

`BEGIN` → `lock_timeout 5s`, `statement_timeout 15s` → `readActiveForUpdate` (`FOR SHARE OF p`, dans la transaction) → registre →
verdict C0 → **`INSERT site_idempotency … ON CONFLICT DO NOTHING`** → objet → lignes → contrôle `count/Σ` → outbox → `COMMIT` →
réponse. Toute exception → `ROLLBACK`, `DB_WRITE_FAILED` 503, connexion détruite (`release(true)`).

| Attaque | Résultat brut | Preuve |
|---|---|---|
| Crash par trigger à l'INSERT `site_order`, à la **2e** `site_order_line`, à `site_outbox_event` | 503 `DB_WRITE_FAILED` (`42703`/`P0001`/`42703` — erreur levée par le trigger d'injection), **0 ligne** dans les 6 tables, clé ensuite → `RECEIVED` | `raw/adv_crash.txt` |
| Échec du **COMMIT** (ligne parasite injectée en `beforeCommit` → contrainte différée `site_order_lines_consistent`) | 503, `detail.reason=23514`, 0 ligne, clé réutilisable | ADV-02 |
| Connexion tuée (`pg_terminate_backend`) après validation | 503 `57P01`, 0 ligne ; connexions inactives du pool tuées ; requête suivante sur le même pool → `RECEIVED` | ADV-03 |
| Serveur `next start` : 11 connexions du pool tuées | serveur vivant, POST suivant → 200 `RECEIVED` | ADV-H3 |
| CE-T03 : 10 transactions bloquées ensemble après validation (barrière) | 1 `RECEIVED` + 9 `REPLAY_SAME_RECEIPT`, +1 objet, +1 événement, +1 idempotence, 1 seul `access_token` | ADV-01 |
| CE-T03 HTTP : 10 POST simultanés | idem ; corps **sémantiquement** identiques hors `access_token`/`outcome`, mais **2 variantes d'octets** (F-03) | ADV-H1, `raw/diag_replay_bytes.txt` |
| Activation BC2 **pendant** une transaction BC4 ouverte | l'activation attend (1 session en `wait_event_type=Lock`) ; chronologie `["BC4_DONE","ACTIVATION_DONE"]` ; reçu sur séquence d'origine ; rejeu après activation → reçu d'origine ; nouveau devis chiffré sur l'ancienne séquence → `CATALOG_CHANGED` 409 | ADV-04a |
| Pointeur tenu `FOR UPDATE` (activation longue simulée) | BC4 → 503 `55P03` après 5004 ms, 0 écriture | ADV-04b (F-10) |

## 4. Cas adversariaux exécutés (29, tous verts sauf mention ; sorties `raw/adv_*.txt`)

| # | Cas | Résultat |
|---|---|---|
| ADV-05 | clés d'idempotence : 128 car. → `RECEIVED` ; 129, 7, espace, accent, vide, `:` initial, entier → `INVALID_DATA` 422 = oracle C0, 0 écriture | ✅ |
| ADV-06 | 22 falsifications : qté 0 / 1 000 001 / `"10"` → `INVALID_DATA` ; 1.5 et 2^53+1 → `PAYLOAD_MALFORMED` 400 ; `tax_amount`, `shipping_amount`, `status`, `lines[].status`, `__proto__` (racine et contact), `constructor`, e-mail invalide, e-mail avec CRLF, téléphone invalide, 0 ligne, 201 lignes, `USD`, séquence `"7"`, montant négatif, 3 décimales → `INVALID_DATA` ; `total_amount` falsifié → `PRICE_CHANGED` 409 ; chaque verdict = oracle C0 ; aucune pollution de prototype ; 0 écriture | ✅ |
| ADV-I1 | clé `RETIRED` seule → **410** `ITEM_RETIRED` ; clé `SUPERSEDED` seule → 409 + `superseded_by {"PI-000000JW3":"PI-000000JVF"}` ; 0 écriture | ✅ |
| ADV-I2 | NUL / BEL dans message ou contact → 422 `INVALID_DATA` (jamais un 503 PostgreSQL) ; U+2028 accepté (C0) | ✅ |
| ADV-H2 | message de 10 Mio → 400 `PAYLOAD_MALFORMED` en 45 ms (lecture bornée, 256 Kio) ; 200 Kio → 422 (texte borné C0) ; serveur vivant | ✅ |
| ADV-08 | octets ACTIVE altérés mais lisibles → `UNSAFE` → commande `CATALOG_UNSAFE` 503, 0 écriture ; **devis non chiffré reçu 200** sur cette ACTIVE altérée (conforme C0 §10.2, F-09) | ✅ / note |
| ADV-09 | poll : base64 exact, `event_sha256`, `payload_digest` recalculé, octets canoniques, `APPLY` puis `EVENT_DUPLICATE_NOOP`, ordre `id` croissant, aucune PII, aucun `id` interne | ✅ |
| ADV-10 | rejeu ×3 d'une requête de poll signée capturée → 3 × 200 avec les mêmes événements, **3 curseurs créés**, `delivery_count` 4 | ⚠️ F-01 |
| ADV-11 | `limit=1` ×4 sans ACK → toujours le même `event_id` | ⚠️ F-02 |
| ADV-12 | ACK id inconnu → 200 `unknown` ; ACK partiel → seul l'id listé `ACKED` ; ré-ACK → `already_acked` ; clé publication / clé ACK → 401 ; signature d'un autre corps → 401 ; signature domaine poll → 401 ; ids en double → 400 ; clé en trop → 400 ; événement `PENDING` → `not_delivered` | ✅ |
| ADV-H5 | `limit` `010`, `1e1`, `+10`, `10.0`, `-1`, `501`, absent → 400 `CURSOR_INVALID` ; `500` → 200 | ✅ |
| ADV-13 | reçu : bon 200 ; faux jeton, réf inconnue, réf `' OR 1=1 --` → 404 **octets identiques** ; jeton absent / vide → 401 ; sans `ref` → 404 ; aucun `id` ni PII dans le reçu ; médianes 245 µs (faux jeton) vs 212 µs (réf inconnue) sur 300 appels | ✅ / F-13 |
| ADV-14 | 708 lignes inspectées (`event_bytes`, `payload`, `receipt_json`, journal, curseurs) : 0 e-mail, nom, organisation, jeton ; aucune colonne taxe/port/paiement BC4 | ✅ |
| ADV-H6 | journaux `next start` : aucun jeton, e-mail, `STAGING_FIXTURE`, `TEST_SECRET`, mot de passe | ✅ |
| ADV-15 | rejeu de la même commande → pas d'`access_token` (décision 3 du builder) | note F-08 |
| ADV-H4 | `Content-Type: text/plain` + `Origin: https://evil.example` → 200 `RECEIVED`, pas d'en-tête CORS | note F-12 |
| ADV-H7 | `SITE_BUSINESS_PERSISTENCE` absente → A2 : `durable:false`, `persistence:NONE_UNTIL_BC4`, pas de `receipt_ref`, 0 écriture | ✅ |
| ADV-H8 | `SITE_BUSINESS_PERSISTENCE=POSTGRESQL` (casse) → 503 `TRANSACTIONS_CONFIG_INVALID` | ✅ |

Chemin `accepted:true` : seulement `accepted()` (`business.ts:100-115`), appelé après `COMMIT` (`:367-368`) ou pour un rejeu d'une
ligne `site_idempotency` **déjà commitée** (lue en READ COMMITTED). Aucun `accepted:true` sans COMMIT trouvé.

## 5. Sécurité

- SQL : toutes les requêtes paramétrées (`$n`) ; seules interpolations : constantes `LOCK_TIMEOUT`/`STATEMENT_TIMEOUT`. ✅
- Corps bornés : business 256 Kio (`readBoundedBytes`, lecture par morceaux puis `cancel`), ACK 256 Kio lu puis 64 Kio parsé. ✅
- Jeton : 256 bits `randomBytes`, stocké SHA-256 (`access_token_sha256` CHECK hex64), comparaison C0 en temps constant ; jamais
  journalisé (ADV-14, H6). Transmis en paramètre d'URL (F-07).
- Aucun identifiant `bigserial` dans les réponses (receipt, order, poll) ; refs opaques 128 bits. ✅
- `grep TEST_SECRET lib app` : un commentaire BC2 seulement ; aucune référence JARVIS dans le lot. ✅
- Journal `site_transaction_log` : codes, refs, `key_id`, SQLSTATE ; jamais de message d'erreur PostgreSQL ni de PII. ✅
- Pas de contrôle `Content-Type`/`Origin` (F-12). Pas d'anti-rejeu du poll (F-01).

## 6. Périmètre et qualité de preuve

- `git diff --name-only 09c0168f..0d21981e` : migrations 010–015, `lib/site-transactions/*`, 5 routes, `tests/bc4/*`, 2 docs,
  `evidence/W1/BC4/**` (ownership) + `package.json`, `tsconfig.bc4.json`, `.gitignore` (hors liste littérale, nécessaires, déclarés au
  REPORT). Aucun fichier BC2, `c0/`, `lib/site-db`, `lib/site-publish`, `lib/site-catalog`, `lib/site-business`. ✅ (F-14)
- Chaque ✅ du REPORT a une sortie brute (`raw/env.txt` `sha=3ebbb48d`, code identique au SHA final) ; je les ai **rejouées** sur mes
  bases avec les mêmes nombres (70, 7, 50, 81, 4, 9). Statut revendiqué `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL` = environnement testé. ✅
- Une affirmation inexacte au REPORT (F-06) et une dans l'annexe transport (F-01).

## 7. Findings

| ID | Sévérité | Constat | Reproduction | Correction attendue |
|---|---|---|---|---|
| F-01 | MINEUR | Requête de poll signée rejouable sans limite. L'annexe `docs/SITE_TRANSPORT_STAGING.md:220-221` dit « sans autre effet » : **faux** — chaque rejeu (a) renvoie tous les événements non acquittés à qui détient la requête capturée, (b) insère une ligne dans `site_event_cursor` (append-only, triggers anti-DELETE/TRUNCATE, aucune purge), (c) incrémente `delivery_count`. | `adv_module.test.mjs` ADV-10 : 3 rejeux → `200:3` ×3, 3 curseurs, `delivery_count` 4 | Corriger le texte de l'annexe (effets réels) ; NON-OUBLI « anti-rejeu du poll (horodatage/nonce signé) + purge des curseurs » avant production. Acceptable en `STAGING_TRANSPORT`. |
| F-02 | MINEUR | Le curseur n'avance pas (`position` enregistrée mais jamais lue) : tout non-acquitté est re-servi **en tête**. Si la Factory refuse durablement ≥ `limit` événements (C0 §13 : `EVENT_PAYLOAD_INVALID`, `EVENT_IDEMPOTENCY_CONFLICT` = « non acquitté »), le flux est bloqué pour toujours. | ADV-11 : `limit=1` ×4 sans ACK → même `event_id` | Documenter la contrainte pour BC5 (limite, quarantaine) ; décision `REQUIRES_OWNER_DECISION` sur le traitement d'un événement empoisonné (route d'ACK-refus ou mise en quarantaine côté SITE). |
| F-03 | MINEUR | Rejeu : corps **non identique octet à octet** au premier (`receipt_json` jsonb réordonne les clés ; lignes aussi), identique sémantiquement. Un client qui hacherait le reçu verrait deux reçus. | `adv/diag_replay_bytes.mjs` → `raw/diag_replay_bytes.txt` (`bytes_equal false`, `semantic_equal true`) ; ADV-H1 | Stocker `canonicalBytes(receipt)` (bytea) et le renvoyer, ou sérialiser `receipt` canoniquement dans les deux branches. |
| F-04 | MINEUR | `package.json` `test:bc4`/`test:bc4:http` codent la base `prodes_site_bc4_test` et `http.e2e.mjs` le port 3351 : un reviewer/CI ne peut rejouer la commande littérale sans viser la base du builder (règle « aucune base partagée »). | `package.json` scripts | `SITE_TEST_DATABASE_URL=${SITE_TEST_DATABASE_URL:-…}` et `PORT` depuis l'environnement. |
| F-05 | NOTE | Table HTTP §13 dupliquée (`common.ts:40-61` / `lib/site-business/validate.ts:28-45`), valeurs identiques aujourd'hui (signalé par le builder). | lecture | Factoriser à l'intégration. |
| F-06 | NOTE | REPORT, dettes : « `lib/site-publish` (`activate`) n'écoute pas `error` » est **inexact** : `receiver.ts:455-456` enregistre un écouteur. | lecture | Corriger le REPORT. |
| F-07 | NOTE | Jeton du reçu dans l'URL : pas de fuite dans les journaux `next start` (ADV-H6), mais historique, `Referer`, journaux de proxy. | ADV-13/H6 | Déjà `REQUIRES_OWNER_DECISION` Q2 ; à trancher avant production (en-tête ou POST). |
| F-08 | NOTE | Jeton non redonné au rejeu : un client dont la 1re réponse est perdue (ou dont le COMMIT a réussi mais la réponse est 503) n'a plus jamais accès à son reçu. | ADV-15 | `REQUIRES_OWNER_DECISION` (réémission vérifiée, ou accepter). |
| F-09 | NOTE | Devis non chiffré accepté sur une ACTIVE `UNSAFE` (octets altérés) : conforme C0 §10.2, mais les contrôles `ITEM_*` portent alors sur un snapshot altéré. | ADV-08 | Candidat contrat v2 (ne pas éditer C0 v1). |
| F-10 | NOTE | `lock_timeout` BC4 5 s < durée possible d'une activation BC2 (verrou `FOR UPDATE` tenu pendant toute l'évaluation, `lock_timeout` BC2 15 s) → commandes 503 pendant une longue activation (rejeu sûr par la même clé). | ADV-04b (503 `55P03` à 5004 ms) | Documenter ; mesurer la durée d'activation réelle. |
| F-11 | NOTE | Intégration : en mode BC4, les pages lisent `SITE_CATALOG_SOURCE=fixture` (seule valeur fonctionnelle) tandis que BC4 juge l'ACTIVE en base → prix affichés et génération jugeante peuvent diverger (`CART_STALE`/`CATALOG_CHANGED` systématiques). | `lib/site-catalog/source.ts:61-67` | Brancher `ActiveGenerationSource` (BC2/intégration). Hors ownership BC4. |
| F-12 | NOTE | Ni `Content-Type` ni `Origin` contrôlés ; sans identifiant ambiant (pas de cookie), le CSRF n'ouvre rien de plus qu'un appel direct ; pas d'en-tête CORS (réponse illisible cross-origin). Pas de limitation de débit. | ADV-H4 | `DEFERRED_FOR_PROD` (débit, anti-abus). |
| F-13 | NOTE | Écart de temps médian 15–28 % (≈ 30–70 µs local) faux jeton vs réf inconnue (1 ligne SQL vs 0). Refs à 128 bits aléatoires : pas d'énumération praticable. | ADV-13 | Aucune en W1. |
| F-14 | NOTE | Diff `c0/` non vide depuis `a9dede14` : provient de la fusion A2 (`156bc548`, re-vente `C0_FROZEN`, `C0_VENDOR_OK`) ; BC4 n'y touche pas. `package.json`/`tsconfig.bc4.json`/`.gitignore` hors liste littérale d'ownership, nécessaires. | `raw/vendor_diff.txt` | Aucune. |

0 BLOQUANT, 0 MAJEUR.

## 8. Verdict

**`REVIEW_PASS`** — statut confirmé `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`.
Les MINEURS F-01 (texte de l'annexe à corriger), F-02, F-03, F-04 sont à corriger ou à porter en NON-OUBLI avant l'intégration
BC5/I1 ; ils ne bloquent pas le lot. Décisions propriétaire à ajouter : F-02 (événement empoisonné), F-08 (jeton au rejeu) ;
F-07 = Q2 existante.

Non prouvé par cette review : perte de connexion exactement pendant le COMMIT (issue ambiguë), charge/volumétrie, poll 48 h, consommateur
Factory réel, HTTPS, PostgreSQL hors Mac. Les nombres ci-dessus comptent des tests `node --test` ; ils ne mesurent ni la couverture
de code ni le comportement sous charge.
