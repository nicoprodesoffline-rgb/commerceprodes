# BC2 — Review indépendante (intégrité transactionnelle, contrat C0, sécurité)

| Élément | Valeur |
|---|---|
| Lot | BC2 Receiver SITE (macro-wave W1+W2), dépôt Commerce |
| Worktree de review | `/Users/nico/Desktop/prodes-w1/review-bc2`, **détaché**, HEAD `a9dede140b34cbf52dfc9288baccc876f5324d08` |
| Base du lot / code testé par le builder | `5f69e742` / `0aa6bdc8` (`git diff --name-only 0aa6bdc8..a9dede14` hors `evidence/` = vide : même code) |
| Environnement | macOS Darwin 25.6, Node 22.23.1, npm 10.9.8, PostgreSQL 18.6 Homebrew `localhost:54318`, Next 16.4.2, `pg` 8.23.1 |
| Bases du reviewer | `prodes_site_rv_bc2` (HTTP), `prodes_site_rv_bc2_test` (tests et attaques), créées par `scripts/db/create-local.sh` |
| Serveur | `next start -p 3332`, PID 3843 lancé et tué par moi, port libre ensuite (`raw/server_pid.txt`) |
| Sorties brutes | `evidence/W1/BC2/review/raw/*.txt` ; scripts d'attaque `evidence/W1/BC2/review/adv/*.mjs` (non commités) |

**Verdict : `REVIEW_FIX_REQUIRED`**. Aucun BLOQUANT. **1 MAJEUR** (F-01 : le corps HTTP est lu en entier en mémoire avant
tout plafond et toute authentification, mesuré). 3 MINEUR, 5 NOTE. Le noyau transactionnel tient sous toutes mes
attaques (échec du COMMIT, SIGKILL du processus juste après le COMMIT, N et N+1 concurrents, verrou partagé,
`lock_timeout`). Aucune règle C0 n'est réimplémentée.

## 1. Rejeu (au SHA `a9dede14`, par le reviewer)

| Gate | Commande | Résultat brut | Fichier |
|---|---|---|---|
| `npm ci` | `npm ci --no-fund` | exit 0, 64 paquets, 0 vulnérabilité ; `pg`/`@types/pg` 8.23.1 | `raw/npm_ci.txt` |
| `c0:check` | `npm run c0:check` | `C0_VENDOR_OK sha=b88f5cdf… files=452 tree_digest=749bff47…21f0` exit 0 ; `git diff 5f69e742..a9dede14 -- c0/` **vide** ; `-- docs/contracts` vide | `raw/c0_check.txt` |
| Jumeau C0 | `c0:build && c0:test` ; `c0:vendor-test` ; `c0:check` | 9/9 pass ; 3/3 pass ; `C0_VENDOR_OK` après build | `raw/c0_twin.txt` |
| typecheck | `npm run typecheck` | exit 0 | `raw/typecheck.txt` |
| build | `env -i PATH HOME NEXT_TELEMETRY_DISABLED=1 npm run build` | exit 0, 5 routes `/api/site/publish/**` dynamiques (ƒ) | `raw/build.txt` |
| Base + migrations | `create-local.sh` ×3, `migrate.mjs` ×2, refus | création idempotente ; `MIGRATIONS_OK applied=4` puis `applied=0` ; `prodes_factory` refusé (script exit 2, migrateur exit 1) ; `PGHOST=jarvis` refusé exit 2 | `raw/db_setup.txt` |
| `test:bc2` | `npm run bc2:build && SITE_TEST_DATABASE_URL=…/prodes_site_rv_bc2_test node --test --test-concurrency=1 tests/bc2/*.test.mjs` (commande du script npm, URL remplacée par ma base) | **50 tests, 50 pass, 0 fail, 0 skipped, 0 cancelled** | `raw/test_bc2.txt` |
| Recette HTTP BC2 | `BASE_URL=http://127.0.0.1:3332 node tests/bc2/http-smoke.mjs` | **15/15 PASS** | `raw/http_bc2_3332.txt` |
| Tests HTTP du spike | `BASE_URL=http://127.0.0.1:3332 PHASE=default node spike/http-tests.mjs` | **66/66 PASS, 0 FAIL** ; seul diff vs `spike/logs` : identifiants aléatoires `SIM-DEV-…` (S07) | `raw/http_spike_default_3332.txt`, `raw/http_spike_diff.txt` |
| Test de mutation (verrou du pointeur retiré) | mutation de `.bc2-build/…/receiver.js` (compilé, ignoré par Git), `08_concurrent_activate` | **10/11 échouent** sans `FOR UPDATE`, rebuild ensuite, source intacte | `raw/mutation_replay.txt` |
| `quality-gate` | `npm run agent-ops:quality` | exit 0 | `raw/quality_gate.txt` |
| Suite Factory, `check_skips`, `verify_source_manifest`, `non_oubli` | — | `NOT_REPLAYED` : dépôt Commerce, le lot ne touche aucun fichier Factory | — |
| PHASE promo/before du spike | — | `NOT_REPLAYED` (comme le builder) | — |

## 2. Conformité au contrat C0 (§4–§9, §13, §15)

Source unique des verdicts : `evaluatePublication` (`c0/ts/src/activation.ts:207`), qui appelle lui-même `mediaCodes`,
`identityCodes`, `coverageCodes`, `holdReason`, `safetyCodes`, `buildAck` et `signing.verify`. Lecture ligne à ligne de
`lib/site-publish/receiver.ts` :

| Règle C0 | Où dans le receiver | Constat |
|---|---|---|
| Étapes 1–12, ordre et codes (§8.2) | `receiver.ts:321-324` (`evaluate` → `evaluatePublication`), appelé par STAGE `:335`, VERIFY `:416`, ACTIVATE `:472` | ✅ aucun code ni ordre recopié ; le receiver n'interprète que `result.stage`/`outcome` |
| STAGE = étapes 1–7, pas d'ACK (§9.1) | `:91-93` (`STAGE_REFUSAL_STAGES`), `:338-361` | ✅ arrêt ≤ `sequence` → refus, rien persisté hors journal ; arrêt à `media` ou au-delà → `STAGED` ; l'ACK d'un ACTIVATED « à blanc » (snapshot sans média) est jeté |
| VERIFY_MEDIA = étape 8 (§8.5) | `:406-443`, store = octets en base `:283-291` | ✅ `MEDIA_*` → reste `STAGED` |
| ACTIVATE sous transaction et verrou, ACK après COMMIT (§9.1) | `:459-501` : `BEGIN`, `FOR UPDATE` du pointeur `:269` puis de la cible `:255`, ACTIVE relue dans le verrou, horloge serveur `:471`, évaluation **complète** `:472`, écritures, `COMMIT` `:499`, réponse `:501` | ✅ toutes les étapes 1–12 rejouées à chaque ACTIVATE avec l'ACTIVE lue sous verrou ; **aucun chemin n'écrit `ACTIVE` ailleurs** (grep) |
| REPLAY = même ACK stocké (§9.1, §9.3) | `:338-341`, `:420-423`, `:503-507` renvoient `active.ackBytes` = `ack_bytes` en base | ✅ vérifié octet pour octet après crash (R02b) |
| `now_utc` = horloge serveur (§8.4) | `serverNowUtc()` `:58-60`, injectable seulement par les tests (`deps.now`) ; les routes n'injectent rien (`http.ts:24`) | ✅ |
| Contrôle `data_label` receiver (§15) | `applyEnvironment` `:150-156` | ✅ appliqué si l'arrêt est après `shape` → équivaut à « après shape, avant semantic » ; règle receiver documentée, pas une règle C0 réécrite |
| HTTP indicatif (§13) | `HTTP_BY_CODE` `:63-87` | ✅ choix de transport ; `SCHEMA_UNSUPPORTED`→400 documenté |
| Politique `null` staging seulement (§8.4 R-11, §15) | `config.ts:53-55` | ✅ `RECEIVER_CONFIG_INVALID` en production (R07) |
| HMAC temps constant (§7) | `c0/ts/src/signing.ts:57` `timingSafeEqual`, après `isHex64` (longueurs égales) | ✅ |
| Erreurs hors C0 | champ `transport_error` séparé (`:112-114`) | ✅ aucun code C0 inventé |

**Étape d'arrêt au STAGE (point d'attaque 2).** Je n'ai trouvé **aucun** cas où une génération refusable par
identité, couverture, hold ou safety est activée sans rejeu de ces étapes : l'ACTIVATE relance toute la fonction pure
sous verrou, quelle que soit l'étape d'arrêt du STAGE ou le statut (`STAGED`/`VERIFIED`/`HOLD`/`REJECTED`). R03 le
montre sous concurrence (N+1 basée sur N activée avant N → `STAGE_HOLD BASE_MISMATCH` ; sœurs → `STALE_SEQUENCE`).
**Une réserve** : la base ACTIVE relue n'est pas contrôlée en intégrité dans ce chemin (F-02).

## 3. Ownership et périmètre

`git diff --name-only 5f69e742..a9dede14` : 64 fichiers. Tous sont dans l'ownership (migrations 001–004, `lib/site-db`,
`lib/site-publish`, `app/api/site/publish/**`, `scripts/db`, `docs/SITE_*`, `tests/bc2`, `package*.json`,
`evidence/W1/BC2`) **sauf** `.gitignore` (+`/.bc2-build/`) et `tsconfig.bc2.json` (compilation CommonJS des tests) :
bénins et justifiés, mais hors liste (F-07). `lib/site-dto`, `components/`, `app/` hors `app/api/site/publish/**` :
diff vide. `c0/` et `docs/contracts` : diff vide.

## 4. Cas adversariaux exécutés (49 vérifications, toutes rejouables)

| # | Cas | Résultat obtenu | Fichier |
|---|---|---|---|
| R01a | **COMMIT lui-même en échec** : déclencheur de contrainte `DEFERRABLE INITIALLY DEFERRED` sur `site_active_pointer` qui lève une exception au COMMIT | 503 `ACTIVATION_ABORTED`, pas d'en-tête d'ACK, pointeur s10 inchangé, s11 reste `VERIFIED`, `ack_bytes` NULL, journal `ACTIVATE_ABORTED reason=P0001`, aucune ligne `ACTIVATED` | `raw/adv_tx.txt` |
| R01b | reprise après suppression du déclencheur | `ACTIVATED`, une seule ACTIVE | idem |
| R02a | **crash réel du processus Node** (processus enfant, `SIGKILL` dès que PostgreSQL a acquitté le COMMIT, avant la réponse) | signal SIGKILL ; bascule durable s11, ACK stocké | idem |
| R02b | rejeu depuis un « nouveau processus » (nouveau pool, horloge réelle) | `REPLAY_ACK`, octets = `ack_bytes` stockés, `verifyAck` → `ACK_VALID`, 0 ligne de plus | idem |
| R03-chain | ACTIVATE **s11 et s12 simultanés** (s12 basée sur s11), 6 tours, ordre de lancement alterné | toujours une seule ACTIVE = pointeur ; issues observées : `ACTIVATED/ACTIVATED → s12` ou `ACTIVATED/STAGE_HOLD BASE_MISMATCH → s11` | idem |
| R03-sibling | s11 et s12 toutes deux basées sur s10 | `ACTIVATED/HOLD BASE_MISMATCH` ou `STALE_SEQUENCE(REJECTED)/ACTIVATED` ; jamais deux bascules | idem |
| R04a | `VERIFIED`, puis octets média altérés en base (même taille), puis ACTIVATE | 422 `MEDIA_HASH_MISMATCH`, retour `STAGED`, pas d'ACK | idem |
| R04b | ligne `site_media` supprimée puis ACTIVATE | `MEDIA_MISSING` | idem |
| R04c | octets reposés par PUT, ACTIVATE **sans** VERIFY_MEDIA | `ACTIVATED` (étape `media` rejouée sous verrou) | idem |
| R04d | média de l'ACTIVE altéré en base après activation | `getActiveGeneration().status = ACTIVE` (F-06) | idem |
| R05 | PUT média : taille 0 signée → 413 ; 20 MiB+1 → 413 ; 20 MiB exact → 201 ; SHA du chemin ≠ octets → 422 `MEDIA_HASH_MISMATCH` ; SHA en majuscules → 400 ; signature de A rejouée pour B → 401 ; signature sur une autre taille → 401 ; clé `activation_ack` → 401 ; signature du domaine snapshot (séparation de domaine) → 401 ; PUT correct 201 ; même signature rejouée → 200 `ALREADY_STORED` ; SVG sous `Content-Type: image/png` → 201 stocké (mime = indication, refusé à VERIFY par le mime déclaré dans `media_refs`) | conforme | idem |
| R06a | `readActiveForUpdate` (FOR SHARE) tenu 1,5 s pendant un ACTIVATE | ACTIVATE bloqué, puis `ACTIVATED` 1 512 ms après, au COMMIT du lecteur | idem |
| R06b | verrou partagé tenu > 15 s | ACTIVATE 503 `ACTIVATION_ABORTED` après 15 018 ms (`55P03`), pointeur inchangé | idem |
| R06c | octets du snapshot ACTIVE altérés en base (`STAGING_FIXTURE`→`PRODUCTION`) | `getActiveGeneration` → `UNSAFE` ✅ ; **mais l'ACTIVATE suivant sur cette base → `ACTIVATED`** (F-02) ; `snapshot` renvoyé = document altéré (F-05) | idem |
| R07 | production + politique `null` ; trousseau illisible ; clé ACK hors scope ; `STAGING_FIXTURE` en production | `RECEIVER_CONFIG_INVALID` ×3 (message sans chemin) ; STAGE 422 `SNAPSHOT_INVALID` `envelope.data_label_environment`, `stage=environment` | idem |
| D1–D5 | `SITE_DATABASE_URL` : `/prodes_factory` ; `/prodes_site_x?database=prodes_factory` ; `?database=postgres` ; hôte `jarvis` ; `?host=jarvis` | `/prodes_factory` refusé ; `?database=` **ignoré par pg** (connexion réelle → `prodes_site_rv_bc2`) ; **hôte `jarvis` accepté, `?host=` accepté** (F-04) | `raw/adv_dburl.txt` |
| B1–B6 | **corps non plafonné** : STAGE 100 MiB, 300 MiB, VERIFY 100 MiB, ACTIVATE 100 MiB, PUT 100 MiB **sans aucun en-tête**, puis 4×300 MiB en parallèle | réponses 400/401 correctes, mais RSS du serveur 59 MiB → pic 344 MiB (+278 MiB pour 100 MiB) → 1 000 MiB (300 MiB) → **3 173 MiB retenus** après ~1,8 GiB envoyés ; 10 lignes de journal `STAGE PAYLOAD_MALFORMED` et des lignes `MEDIA_PUT SIGNATURE_INVALID` écrites par des requêtes non authentifiées (F-01) | `raw/adv_body_size.txt` |
| H-R01–R16 | HTTP 3332 : sans en-têtes → 401 ; `x-c0-key-id` à deux valeurs → 401 ; signature en majuscules → 401 ; `key_id` inconnu → 401 sans écho ; corps non-JSON → 400 `PAYLOAD_MALFORMED` / `REQUEST_INVALID` ; injection SQL dans `publication_id` (ACTIVATE, STATUS) → 400 ; séquence `1e0` → 400 ; STATUS signé → 200 sans octets ; STATUS avec la signature d'une autre génération → 401 ; `PRODUCTION` en staging → 422 `envelope.data_label_environment` ; ACTIVATE d'une génération inconnue **non signé → 404** (F-03) ; VERIFY non signé → 401 ; aucune réponse ne contient signature, `TEST_SECRET`, mot de passe ou chemin | 16/16 conformes | `raw/adv_http.txt` |
| L1 | journal des deux bases après toutes les attaques | 0 signature de transport, 0 signature d'ACK, 0 `TEST_SECRET` ; clés `detail` bornées (`generation_status,key_id,media_sha256,rules,second_effect,size,superseded_sequence`) ; SQL interpolé = constantes seulement (`receiver.ts:269,273,460`) | `raw/adv_log_hygiene.txt` |
| M1 | mutation `FOR UPDATE` retiré | 10/11 tests de la famille 8 échouent | `raw/mutation_replay.txt` |

## 5. Sécurité

- Secrets : `grep TEST_SECRET` dans `lib app scripts db docs` → un commentaire de `config.ts:7` seulement ; aucun `.env*` lu
  ou créé ; le trousseau de test vient de `c0/fixtures/keys/test_keyring.json`.
- Requêtes paramétrées partout ; les trois interpolations sont des constantes (L1).
- Désérialisation : le corps snapshot passe par le lecteur strict C0 (`parseBytes`, 32 MiB) ; le corps de contrôle par
  `parseControl` (`exactKeys`, jetons C0, 256 KiB) ; **mais ces plafonds s'appliquent après lecture complète** (F-01).
- Réponses de configuration invalide : `message` renvoyé au client (`http.ts:27`) ; messages vérifiés sans chemin ni
  mot de passe (R07) ; le nom de base refusé est renvoyé (acceptable).
- `transport_json` (signature de publication) est stocké dans `site_generation`, conformément au schéma du mandat ; il
  n'apparaît ni au journal ni dans STATUS.
- Aucun chemin JARVIS dans le code ; mais le pool n'empêche pas un hôte distant (F-04).

## 6. Avis motivé sur la décision 2 du builder (« ACTIVATE sans VERIFY_MEDIA préalable »)

**Acceptable, à garder.** L'ACTIVATE relit les octets de `site_media` dans la transaction (`receiver.ts:469`) et
l'étape C0 `media` (`mediaCodes`, `activation.ts:182-198`) revérifie SHA-256, taille **et** signature binaire contre le
`mime` déclaré par `media_refs`. Le statut `VERIFIED` n'est jamais lu comme condition : R04a (VERIFIED puis octets
altérés → refus), R04b (ligne supprimée → `MEDIA_MISSING`) et R04c (STAGED sans VERIFY, octets conformes → activé)
le prouvent. Exiger `VERIFIED` ajouterait un code de transport inventé sans gain de sûreté ; la vérité est l'octet,
pas le drapeau, ce qui est exactement le refus « un hash suffit » du mandat. Deux précisions à documenter :
`verified_at = COALESCE(verified_at, now)` à l'activation (`:483`) signifie « étape media franchie », pas « VERIFY_MEDIA
appelé » ; et `VERIFIED` est purement informatif (BC5 ne doit pas en déduire qu'une activation passera).

## 7. Qualité de preuve du REPORT builder

- Chaque ✅ du tableau de clôture a sa sortie brute au SHA `0aa6bdc8` (en-tête `commit testé`), sauf
  `mutation_no_pointer_lock.txt` (daté « avant le commit `32120e37` », sans SHA) : **rejoué par moi au SHA final,
  même résultat** (M1).
- Chiffres rejoués et confirmés : 50/50, 15/15, 66/66, 9/9, 3/3, migrations 4 puis 0, refus `prodes_factory`.
- Statut revendiqué `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL` : ≤ environnement testé ✅. La section « Ce qui n'est pas
  prouvé » est honnête ; j'ai couvert deux de ses trous (échec du COMMIT lui-même : R01 ; crash du processus Node : R02).
  Restent non prouvés : plusieurs instances Next, Windows/JARVIS, volumétrie, transport réel.
- Le builder a signalé lui-même la dette de taille du corps ; elle est mesurée ici (F-01).

## 8. Findings

### F-01 — MAJEUR — Corps HTTP lu en entier en mémoire avant tout plafond et toute authentification
- **Où** : `lib/site-publish/http.ts:17-19` (`await request.arrayBuffer()`), appelé par les 4 routes POST/PUT avant
  `handle()` ; plafonds C0 (32 MiB, 256 KiB, 20 MiB) appliqués seulement ensuite ; chaque refus non authentifié écrit
  une ligne de journal (`receiver.ts:343`, `:374`).
- **Reproduction** : serveur 3332 ; `curl -X POST --data-binary @big100.bin http://127.0.0.1:3332/api/site/publish/stage`
  sans en-tête → 400 correct, RSS +278 MiB ; 300 MiB → +559 MiB ; après ~1,8 GiB envoyés, RSS **3,17 GiB retenus**
  (`raw/adv_body_size.txt`). Même chose sur `verify-media` (+202 MiB pour un plafond logique de 256 KiB) et sur
  `media/{sha}` sans signature. Le pic 4×300 MiB en parallèle n'a pas été échantillonné (boucle de mesure défaillante,
  `UNKNOWN`) ; seule la RSS retenue ensuite est mesurée.
- **Impact** : n'importe quel client non authentifié peut épuiser la mémoire du receiver SITE et gonfler
  `site_publication_log` (append-only, sans purge). C0 §4 fixe la taille comme règle de lecture ; ici elle n'est
  appliquée qu'après le buffer.
- **Correction attendue** : lecture bornée en flux par route (refuser `Content-Length` > plafond, et couper le flux au
  plafond + 1 octet) → 413 de transport **avant** buffer : 32 MiB STAGE, 256 KiB VERIFY/ACTIVATE, 20 MiB PUT média ;
  test HTTP qui prouve qu'un corps de 100 MiB ne fait pas croître la RSS ; décider si les refus non authentifiés sont
  journalisés (agrégés ou limités).

### F-02 — MINEUR — L'ACTIVATE utilise comme base une ACTIVE que `getActiveGeneration` déclare `UNSAFE`
- **Où** : `receiver.ts:268-280` (`loadActive`) lit `snapshot_bytes` sans `isCanonical` ni recalcul de `payload_sha256`,
  alors que `lib/site-db/generation.ts:52-56` le fait.
- **Reproduction** : R06c (`raw/adv_tx.txt`) : base s10 ACTIVE, `UPDATE site_generation SET snapshot_bytes = …PRODUCTION…`
  → `getActiveGeneration().status = UNSAFE`, puis ACTIVATE s11 → `ACTIVATED`. Les étapes `identity` et `hold`
  (`UNEXPLAINED_WITHDRAWALS`) se sont donc jouées contre des clés READY non garanties.
- **Précondition** : écriture directe en base ou corruption ; non atteignable par HTTP. D'où MINEUR.
- **Correction attendue** : appliquer dans `loadActive` le même contrôle d'intégrité que `interpret` (octets canoniques,
  SHA recalculé = pointeur = ligne) et décider explicitement, puis documenter : soit fail-closed (503, aucune
  activation tant que l'ACTIVE est `UNSAFE`, avec un chemin de reprise opérationnel), soit roll-forward autorisé
  au-dessus d'une ACTIVE `UNSAFE`, mais alors sans couverture calculée contre des octets non vérifiés. Ajouter un
  déclencheur d'immutabilité de `snapshot_bytes`/`ack_bytes` pour les statuts `ACTIVE`/`SUPERSEDED`.

### F-03 — MINEUR — ACTIVATE / VERIFY_MEDIA non authentifiés travaillent avant le refus de signature
- **Où** : `receiver.ts:459-472` : un ACTIVATE **sans signature** sur une génération existante prend `FOR UPDATE` sur
  le pointeur et sur la cible, relit et parse l'ACTIVE et la cible (≤ 32 MiB chacune) et charge les médias, avant que
  la fonction pure ne réponde `SIGNATURE_INVALID`. Une génération inconnue répond 404 avant toute authentification
  (H-R14), alors que STATUS vérifie le scope avant de lire (`:548`).
- **Reproduction** : H-R14 (`raw/adv_http.txt`) pour le 404 non authentifié ; prise de verrou constatée dans le code
  (non mesurée sous charge : `UNKNOWN`). Le corps de contrôle `{publication_id, catalogue_sequence, payload_sha256}`
  n'est pas secret (il figure dans l'ACK et le journal).
- **Impact** : un flot d'ACTIVATE non signés sérialise et ralentit les activations légitimes (`lock_timeout` 15 s → 503),
  et occupe le pool (max 10).
- **Correction attendue** : avant le verrou, une porte d'authentification de transport qui vérifie la signature du
  contexte §7 de la ligne stockée. C'est un contrôle d'accès, pas une réécriture d'étape : les étapes 1–5 sont déjà
  passées au STAGE, la signature est donc la première étape qui peut échouer. Puis l'évaluation C0 complète reste
  inchangée. Uniformiser l'ordre 401 avant 404 sur VERIFY_MEDIA et ACTIVATE, comme STATUS.

### F-04 — MINEUR — Le garde-fou `SITE_DATABASE_URL` ne contrôle que le nom de base, pas l'hôte
- **Où** : `lib/site-db/pool.ts:21-32`.
- **Reproduction** : `raw/adv_dburl.txt` : `postgres://…@jarvis:5432/prodes_site_prod` et `…/prodes_site_rv_bc2?host=jarvis`
  sont **acceptés** (pg viserait `host=jarvis`). Bon point : `?database=prodes_factory` est ignoré par pg (connexion
  réelle vers la base du chemin).
- **Correction attendue** : en `staging`, n'admettre que `localhost`/`127.0.0.1`/`::1` (comme `create-local.sh:13`) ou
  une liste d'hôtes explicite ; refuser les paramètres de requête `host`, `hostaddr`, `options`, `dbname`.

### F-05 — NOTE — `ActiveGeneration.snapshot` en état `UNSAFE`
`generation.ts:15-21` type `snapshot: Snapshot`, mais la valeur est `null` (octets illisibles) ou le **document altéré**
(R06c) quand `status = "UNSAFE"`. `docs/SITE_DB_SCHEMA.md:130-133` ne dit pas que BC3/BC4 ne doivent jamais lire
`snapshot` dans ce cas. Correction : `snapshot: Snapshot | null` et une phrase de contrat.

### F-06 — NOTE — `UNSAFE` ne couvre pas les médias de l'ACTIVE
R04d : un média de l'ACTIVE altéré après activation laisse `status = ACTIVE`. À documenter pour BC3 : la route qui sert
`/media/[sha256]` doit revérifier le SHA à la lecture, ou les médias référencés par une ACTIVE doivent être immuables.

### F-07 — NOTE — Deux fichiers hors liste d'ownership
`.gitignore` (+`/.bc2-build/`) et `tsconfig.bc2.json`. Bénins et nécessaires à `test:bc2` ; à valider explicitement par
l'orchestrateur.

### F-08 — NOTE — Signature PUT média rejouable sans limite de temps
Contexte `{sha256, size}` sans nonce ni horodatage : une signature capturée se rejoue indéfiniment (R05 →
`ALREADY_STORED`). Sans effet nuisible grâce à l'adressage par contenu (elle ne peut poser que les octets exacts du SHA,
et le chemin `REPAIRED` ne peut que réparer). Acceptable en `STAGING_TRANSPORT` ; à reprendre avec l'anti-rejeu
horodaté (C0 §15).

### F-09 — NOTE — Journal append-only contournable par le propriétaire
Le rôle `prodes_site` possède les tables, il peut donc `ALTER TABLE … DISABLE TRIGGER`. Dette déjà déclarée par le builder
(droits fins avant toute base partagée) ; confirmée.

## 9. Verdict

**`REVIEW_FIX_REQUIRED`**. À corriger avant `REVIEW_PASS` : **F-01** (MAJEUR). Recommandé dans le même cycle, faible
coût : F-02, F-03, F-04. Les NOTE n'empêchent pas le passage.
Une re-review devra rejouer : `adv_body_size` (RSS stable sous 100 MiB → 413), R06c (fail-closed ou décision documentée),
H-R14 (401 avant 404), `adv_dburl` (hôte distant refusé), et `test:bc2` complet.

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| `c0/` et contrats intacts | ✅ | `raw/c0_check.txt`, `raw/c0_twin.txt` | égalité au manifeste A1 seulement |
| build / typecheck / npm ci | ✅ | `raw/build.txt`, `raw/typecheck.txt`, `raw/npm_ci.txt` | |
| `test:bc2` 50/50 | ✅ | `raw/test_bc2.txt` | base du reviewer, fixtures synthétiques |
| HTTP BC2 15/15, spike 66/66 | ✅ | `raw/http_bc2_3332.txt`, `raw/http_spike_*` | PHASE promo/before non rejouées |
| Aucune règle C0 réimplémentée | ✅ | §2 | lecture de code + tests, pas de preuve formelle |
| Transaction (COMMIT en échec, crash après COMMIT, N/N+1, verrou partagé, `lock_timeout`) | ✅ | `raw/adv_tx.txt` | un seul processus Next ; multi-instances non testé |
| Décision 2 (ACTIVATE sans VERIFY) | ✅ acceptable | R04a–c | |
| Plafond de corps HTTP | ⚠️ F-01 | `raw/adv_body_size.txt` | pic parallèle non mesuré (`UNKNOWN`) |
| Intégrité de l'ACTIVE au chemin d'activation | ⚠️ F-02 | R06c | précondition écriture base |
| Authentification avant verrou | ⚠️ F-03 | H-R14, code | effet sous charge `UNKNOWN` |
| Garde d'hôte base SITE | ⚠️ F-04 | `raw/adv_dburl.txt` | |
| Statut du lot | `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL` confirmé, conditionné à F-01 | — | rien ne vaut `INTEGRATED_REAL` |

---

# Re-review c5dc9d02

| Élément | Valeur |
|---|---|
| HEAD rejoué | `c5dc9d0278337a8aaec9a8e8b7542a2189e915f7` (worktree détaché) ; code = `522ed1df` (`git diff --name-only 522ed1df..c5dc9d02` hors `evidence/` vide) |
| Bases | `prodes_site_rv_bc2`, `prodes_site_rv_bc2_test` **recréées** (`create-local.sh --recreate`) puis migrées 001–005 |
| Serveur | `next start -p 3332`, PID 97117 lancé et tué par moi, port libre ensuite (`raw2/server_pid.txt`) |
| Sorties brutes | `evidence/W1/BC2/review/raw2/*.txt` ; scripts `adv/adv_body2.sh`, `adv/adv_fix.mjs`, `adv/adv_dburl2.mjs` (+ rejeu de `adv_tx.mjs`, `adv_http.mjs`) |

## R1. Rejeu des gates

| Gate | Résultat brut | Fichier |
|---|---|---|
| `npm ci` | exit 0 | `raw2/npm_ci.txt` |
| `c0:check` | `C0_VENDOR_OK sha=b88f5cdf… files=452 tree_digest=749bff47…21f0` ; `git diff a9dede14..c5dc9d02 -- c0/ docs/contracts` **vide** ; `5f69e742..c5dc9d02` vide | `raw2/c0_check.txt` |
| typecheck | exit 0 | `raw2/typecheck.txt` |
| build `env -i` | exit 0, 5 routes `/api/site/publish/**` dynamiques | `raw2/build.txt` |
| Migrations | `applied=5` puis `applied=0` (idempotent), 005 sha `5494f0bd…` | `raw2/db_setup.txt` |
| `test:bc2` (ma base de test) | **58 tests, 58 pass, 0 fail, 0 skip, 0 cancelled** | `raw2/test_bc2.txt` |
| Recette HTTP BC2 (3332) | **16/16 PASS** (dont H05b : connexion de l'ACTIVATE tuée sous verrou → 503, serveur vivant, puis H07 `ACTIVATED`) | `raw2/http_bc2_3332.txt` |
| Spike HTTP (3332) | **66/66 PASS, 0 FAIL** | `raw2/http_spike_default_3332.txt` |

## R2. F-01 (MAJEUR) : corps HTTP, **corrigé**

Mesure du reviewer : RSS du serveur 97117 échantillonnée toutes les 50 ms, avec la boucle parallèle corrigée
(`raw2/adv_body_size.txt`). « Signature au format » = clé `c0-test-publish-02` connue et 64 hex quelconques.

| Envoi | Code | Pic RSS | Journal |
|---|---|---|---|
| STAGE 100 MiB sans en-têtes (`Content-Length` / chunked) | 401 `transport_gate` | +1 / +1 MiB | +0 |
| STAGE 100 MiB, signature au format, `Content-Length` | 413 immédiat | +0 MiB | +0 |
| STAGE 100 MiB, signature au format, chunked | 413 `BODY_TOO_LARGE` (`max_bytes` 33554432) | +48 MiB | +0 |
| VERIFY_MEDIA 100 MiB chunked / ACTIVATE 100 MiB `Content-Length` | 413 / 413 | +0 / +0 MiB | +0 |
| PUT média 100 MiB chunked, signature au format / sans en-têtes | 413 / 401 | +22 / +0 MiB | +0 |
| **4 × STAGE 300 MiB chunked en parallèle (cas non mesuré à la 1re review)**, 3 tours | 413 ×12 | tour 1 +110, tour 2 +41, tour 3 +11 MiB (plateau) | +0 |
| 4 × STAGE 300 MiB sans en-têtes en parallèle, 2 tours | 401 ×8 | +0 / +0 MiB | +0 |
| `Content-Length: 10` menteur + 100 MiB | 400 (parseur HTTP de Node) ; 10 octets lus, évalués `PAYLOAD_MALFORMED` | +0 MiB | +1 (refus C0 post-porte) |

Bilan : ~3,6 GiB envoyés au total, RSS 109 → 345 MiB, et plus de croissance une fois le plateau atteint. Avant
correctif (`a9dede14`) : +278 MiB pour un seul envoi de 100 MiB, 3,17 GiB retenus. **Critère « pas de rétention
proportionnelle aux octets reçus » : satisfait.** Il est mieux adapté qu'un seuil absolu, car la RSS de Node ne
redescend pas (allocateur natif). Pour BC5, le chiffre utile est le pic d'un tour : jusqu'à +110 MiB à froid pour
4 flux parallèles plafonnés à 32 MiB.
**Résiduel mesuré (F-10)** : clé publique connue + signature fausse + corps de 30 MiB, sous le plafond → lu en entier,
`PAYLOAD_MALFORMED` journalisé ; 8 en parallèle → +223 MiB, plateau ~700 MiB sur 6 rafales (pas de rétention
proportionnelle), **+48 lignes de journal pour 48 requêtes non authentifiées**.

## R3. F-02 (MINEUR) : **corrigé** (`raw2/adv_fix.txt`)

- RR-F02a, migration 005 : UPDATE de `snapshot_bytes`, `payload_sha256`, `publication_id`, `transport_json`, et d'un
  ACK déjà posé (vers `NULL` ou vers autre chose), tous **refusés** ; `last_result` reste modifiable. Mon ancien
  script R06c échoue désormais sur `site_generation: octets et identité d'une génération immuables` (`raw2/adv_tx_rejeu.txt`).
- RR-F02b, ACTIVE corrompue (déclencheur désactivé par le propriétaire, comme le builder, puis réactivé) :
  `getActiveGeneration` → `UNSAFE`, `snapshot: null` ; ACTIVATE de s11 → **409 `CATALOG_UNSAFE` `stage: active_integrity`** ;
  STAGE → 409 ; s11 reste `VERIFIED` ; pointeur s10.
- RR-F02c, pointeur seul altéré (la table n'est pas couverte par 005) : SHA ≠ ligne, ou re-pointage direct vers une
  génération `VERIFIED` → `UNSAFE` et `CATALOG_UNSAFE`, une seule ACTIVE.
- Code C0 : `CATALOG_UNSAFE` correspond à la condition « génération marquée UNSAFE » de la §13. Le receiver le pose
  avant d'appeler la fonction pure, comme précondition de sûreté ; aucune étape C0 n'est réordonnée (NOTE F-13).

## R4. F-03 (MINEUR) : **corrigé** (RR-F03)

ACTIVATE et VERIFY_MEDIA : sans clé → 401 ; clé ACK → 401 ; clé valide + génération inconnue → 404 ; clé valide +
génération connue + HMAC faux → 401 `transport_gate`. Journal +0. Avec un verrou exclusif tenu sur le pointeur **et**
sur la cible, l'ACTIVATE mal signé répond 401 en **7 ms** ; l'ACTIVATE bien signé reste bloqué (1,2 s observées)
puis passe `ACTIVATED` à la libération. Aucun verrou n'est pris avant la vérification de la signature. Mon cas H-R14
(attente « 404 sans signature ») échoue désormais à dessein : 401 (`raw2/adv_http.txt`, 15/16, l'écart est le correctif).

## R5. F-04 (MINEUR) : **corrigé** (`raw2/db_setup.txt`, `raw2/adv_dburl2.txt`)

- Migrateur : refus de `jarvis`, `JARVIS.tail`, `?host=`, `?hostaddr=`, `?options=`, `?dbname=`, hôte `10.0.0.5` ; refus de `jarvis` **même avec**
  `SITE_ALLOW_REMOTE_DB=1`.
- Pool : refus de `user@localhost:54318@jarvis` (pg viserait jarvis), `%6Aarvis`, `?HOST=`/`?Host=`, `/tmp` (socket),
  `0.0.0.0`, et d'une IP Tailscale sans dérogation ; `[::1]` accepté ; `SITE_ALLOW_REMOTE_DB=1` documenté
  (`docs/SITE_TRANSPORT_STAGING.md:14`, `docs/SITE_DB_SCHEMA.md:14`).
- Résiduel (F-11, NOTE) : avec `SITE_ALLOW_REMOTE_DB=1`, `localhost,jarvis` (hôtes multiples) et l'IP Tailscale de
  JARVIS passent. Il faut la dérogation explicite pour y arriver, et un nom d'hôte ne peut pas protéger contre une IP.

## R6. Connexions tuées (RR-CONN)

- `withTransaction` dont la connexion est tuée (`pg_terminate_backend`) pendant un `readActiveForUpdate` + `pg_sleep` →
  rejet `57P01`, **0 exception non capturée**, pool réutilisable (lecture suivante = s10).
- ACTIVATE dont la connexion est tuée **pendant l'attente du verrou** (backend repéré par `wait_event_type='Lock'`) →
  503 `ACTIVATION_ABORTED`, pas d'ACK, journal `reason=57P01` ; l'ACTIVATE suivant passe `ACTIVATED`.
- Côté HTTP : H05b de la recette, rejouée sur 3332 → serveur vivant, la requête suivante réussit.

## R7. Non-régression (rejeu des attaques de la 1re review sur le nouveau code)

R01a/b (COMMIT en échec), R02a/b (SIGKILL après COMMIT → `REPLAY_ACK` identique, `ACK_VALID`), R03 chain/sibling
(N et N+1 concurrents), R04a–d, R05 (13 sous-cas média), R06a (FOR SHARE), R06b (`lock_timeout` 15 016 ms) : **13/13
PASS** (`raw2/adv_tx_rejeu.txt`). R07 n'est pas rejoué : `config.ts` est inchangé. HTTP : 15/16, le seul écart
étant le correctif F-03.
Correction de mon harnais : `crash_child.mjs` ignorait la forme à callback de `pool.connect` qu'utilise `pool.query`,
désormais appelé par `authenticateControl`. Le premier essai a bloqué ; j'ai tué ses deux PID et je l'ai relancé
après correction.

## R8. Périmètre

`git diff --name-only a9dede14..c5dc9d02` (`raw2/diff_names.txt`) : `lib/site-publish/{http,receiver}.ts`,
`lib/site-db/{pool,generation}.ts`, `db/migrations/005_site_generation_immutable.sql`, `scripts/db/migrate.mjs`,
`tests/bc2/{15,16,17,http-body-limits,http-smoke}`, `docs/SITE_*`, `evidence/W1/BC2/**`, **et les 5
`app/api/site/publish/**/route.ts`**. Ces routes ne sont pas dans la liste de l'orchestrateur, mais elles sont dans
l'ownership du mandat (passage à `handleWithBody`) et nécessaires à F-01 : acceptées. `c0/`, `docs/contracts`,
`lib/site-dto`, `components/` : intacts.

## R9. Nouveaux constats

- **F-10, MINEUR (résiduel de F-01, non bloquant)** : la porte du STAGE ne peut pas vérifier le HMAC sans le corps,
  puisque la signature lie le `payload_sha256` des octets. Un tiers qui connaît un `key_id` de publication (ce n'est
  pas un secret : il circule dans les en-têtes et figure dans `site_publication_log.detail.key_id`) fait donc lire
  jusqu'à 32 MiB par requête, parser, et écrire une ligne de journal par refus C0 d'avant la signature. Mesuré : 8
  requêtes parallèles → +223 MiB, plateau ~700 MiB, +48 lignes pour 48 requêtes. Borné par requête, pas par
  concurrence. Correction attendue avant toute exposition : limite de concurrence ou de débit par clé ou par source
  dans le transport réel (`DEFERRED_FOR_PROD`, C0 §15), et/ou journalisation agrégée des refus pré-signature.
- **F-11, NOTE** : contournement de la garde d'hôte par `localhost,jarvis` ou par une IP, seulement sous `SITE_ALLOW_REMOTE_DB=1`.
- **F-12, NOTE** : `site_active_pointer` n'est pas protégé par 005 ; l'altération est détectée (`UNSAFE`, RR-F02c), pas empêchée.
- **F-13, NOTE** : une ACTIVE `UNSAFE` bloque STAGE, VERIFY et ACTIVATE (fail-closed) ; la seule reprise documentée
  est un geste DBA (`docs/SITE_DB_SCHEMA.md:137`). Le choix de `CATALOG_UNSAFE` pour ce cas est conforme à la §13.
- Statut des findings antérieurs : F-05 corrigé (`snapshot: null`, RR-F02b) ; F-06 (médias de l'ACTIVE hors `UNSAFE`,
  R04d toujours `ACTIVE`), F-07, F-08, F-09 : NOTE ouvertes, documentées.

## Verdict final de re-review : **`REVIEW_PASS`**

0 BLOQUANT, 0 MAJEUR ouvert. F-01 est corrigé et mesuré ; F-02, F-03 et F-04 sont corrigés et vérifiés par attaque.
Restent ouverts : 1 MINEUR (F-10) et des NOTE (F-06, F-07, F-08, F-09, F-11, F-12, F-13), à porter en NON-OUBLI avant
toute exposition. Chiffres : `test:bc2` 58/58, HTTP BC2 16/16, spike 66/66, `C0_VENDOR_OK`, migrations 5 → 0,
et 33 vérifications adversariales rejouées à `c5dc9d02` (F-01 17 envois, F-02 3, F-03 1 × 8 ordres + mesure sous
verrou, F-04 27 URL, connexions tuées 2, non-régression 13).

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Gates (ci, build, typecheck, `c0:check`, 58/58, 16/16, 66/66) | ✅ | `raw2/*` | fixtures synthétiques |
| F-01 plafonds, 401 sans lecture, 413, 0 journal pré-authentification | ✅ | `raw2/adv_body_size.txt` | RSS = mesure `ps` ; plateau, pas de seuil absolu |
| F-01 4 × 300 MiB parallèles | ✅ +110 / +41 / +11 MiB | idem | 1 serveur, macOS |
| F-02 ACTIVE corrompue → `CATALOG_UNSAFE` ; 005 | ✅ | `raw2/adv_fix.txt` | corruption simulée en désactivant le déclencheur |
| F-03 ordre 401 → 404 → 401, aucun verrou avant signature | ✅ 7 ms sous verrou | idem | charge prolongée `UNKNOWN` |
| F-04 garde d'hôte serveur et migrateur | ✅ | `raw2/db_setup.txt`, `raw2/adv_dburl2.txt` | F-11 sous dérogation |
| Connexion tuée (`withTransaction`, attente du verrou, HTTP) | ✅ | `raw2/adv_fix.txt`, `raw2/http_bc2_3332.txt` | |
| Clé connue + signature fausse (F-10) | ⚠️ MINEUR | `raw2/adv_body_size.txt` | transport réel `DEFERRED_FOR_PROD` |
| Statut du lot | `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL` | — | rien ne vaut `INTEGRATED_REAL` |
