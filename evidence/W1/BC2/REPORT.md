# BC2 — Receiver SITE (STAGE / MEDIA / VERIFY_MEDIA / ACTIVATE / STATUS) sur PostgreSQL SITE local

Statut maximal revendiqué : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`** — à confirmer par la review indépendante
(opus, intégrité transactionnelle). Le builder ne s'auto-approuve pas.

| Élément | Valeur |
|---|---|
| Dépôt / worktree | Commerce, `/Users/nico/Desktop/prodes-w1/commerce-bc2` |
| Branche | `build/w1-bc2-receiver`, créée depuis `build/site-d-foundation@5f69e742` |
| **Code testé** | **`522ed1df4002784c1e845c720fa9f615a10db9b5`** (après correctifs de review, toutes les gates ci-dessous) ; le commit suivant n'ajoute que `evidence/W1/BC2/`. Premier cycle : `0aa6bdc8` (review `REVIEW_FIX_REQUIRED` à `a9dede14`) |
| C0 | vendu, Factory `b88f5cdf2ca64eca8de4d19c077262e11f9e7e54`, `tree_digest=749bff47…21f0`, **aucun octet modifié** |
| Environnement | macOS (Darwin 25.6), Node 22.23.1, npm 10.9.8, Next 16.4.2, TypeScript 5.9.3, `pg` 8.23.1, PostgreSQL 18.6 Homebrew `localhost:54318` |
| Bases | `prodes_site_bc2` (dev, HTTP), `prodes_site_bc2_test` (tests) — rôle de test `prodes_site` |
| Rejeu | `bash evidence/W1/BC2/raw/replay_gates.sh /Users/nico/Desktop/prodes-w1/commerce-bc2` |

## Tableau de clôture

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| `c0/` inchangé (`npm run c0:check`) | ✅ `C0_VENDOR_OK` ×2 (avant/après build) | `raw/c0_check.txt`, `raw/c0_twin.txt`, `raw/git_state.txt` (`git diff 5f69e742 -- c0` vide) | ne prouve que l'égalité au manifeste A1 |
| Jumeau C0 (`c0:test`, `c0:vendor-test`) | ✅ 9/9, 3/3 | `raw/c0_twin.txt` | parité Python↔TS non rejouée ici (pas de Python dans Commerce) |
| `npm ci` strict | ✅ exit 0, 0 vulnérabilité | `raw/npm_ci.txt` | `pg`/`@types/pg` 8.23.1 ajoutés (commit `6866a90d`) |
| `npm run typecheck` | ✅ exit 0 | `raw/typecheck.txt` | |
| `npm run build` sans variable | ✅ exit 0, 5 routes `/api/site/publish/**` dynamiques | `raw/build.txt` | build `env -i` : aucune connexion base au build |
| Base locale + migrations 001–005 | ✅ création idempotente, `MIGRATIONS_OK` puis `applied=0` ; refus `prodes_factory` (script exit 2, migrateur exit 1), hôte `jarvis` et `?host=jarvis` refusés (exit 1) | `raw/db_setup.txt` (`\d+` des 4 tables, `schema_migrations`) | mot de passe `local-dev-only` = identifiant de test |
| **Familles 1–13 + data_label + interface + correctifs de review** (`npm run test:bc2`) | ✅ **58/58 PASS, 0 FAIL, 0 skip** (50 du premier cycle + 6 F-01…F-04 + 2 perte de connexion) | `raw/test_bc2.txt` | PostgreSQL réel ; fixtures synthétiques uniquement |
| Plafonds de corps sur serveur réel (F-01) | ✅ 22/22 PASS, deux runs (tas normal et tas plafonné 128 MiB) | `raw/http_body_limits_3331.txt`, `raw/http_body_limits_3331_heap128.txt` | RSS mesurée par `ps` toutes les 20 ms ; voir « Correctifs de review » |
| Connexion PostgreSQL tuée sous verrou (constat BC4) | ✅ en processus (2 tests) et HTTP (H05b) ; mutation des écouteurs → 2/2 échouent | `raw/test_bc2.txt`, `raw/http_bc2_3331.txt`, `raw/mutation_connection_listener.txt` | mutation faite sur le JS compilé avant le commit `522ed1df` (code identique) |
| Test de mutation (verrou pointeur retiré) | ✅ famille 8 : 10/11 échouent sans `FOR UPDATE` | `raw/mutation_no_pointer_lock.txt` | rejoué à la main avant le commit `32120e37` (code identique), non scripté |
| Recette HTTP réelle BC2 (port 3331) | ✅ 16/16 PASS (dont H05b) | `raw/http_bc2_3331.txt`, `raw/http_db_after.txt` | horloge réelle : ACK comparé à `ack_s1.json` hors `activated_at_utc`/`signature`, puis `verifyAck` → `ACK_VALID` |
| Tests HTTP du spike (port 3331) | ✅ 66/66 PASS, 0 FAIL | `raw/http_spike_default_3331.txt`, `raw/http_spike_diff.txt` | seule différence vs `spike/logs` : identifiants aléatoires `SIM-DEV-…` (S07) ; PHASE promo/before non rejouées |
| Serveur lancé et tué par PID | ✅ deux serveurs successifs (normal, tas 128 MiB), chacun lancé et tué par PID, port libre après chaque arrêt | `raw/server_pid.txt`, `raw/start_3331.txt` | |
| `quality-gate.mjs` (agent-ops) | ✅ exit 0, aucune commande recommandée | `raw/quality_gate.txt` | outil de recommandation, ne lance rien |
| Docs `SITE_DB_SCHEMA.md`, `SITE_TRANSPORT_STAGING.md` | ✅ livrés | `docs/` | transport = `STAGING_TRANSPORT`, hors C0 |
| Ownership : `.gitignore` (+`/.bc2-build/`) et `tsconfig.bc2.json` hors liste (F-07) | ⚠️ conservés | review §3 | nécessaires à `test:bc2`, à valider par l'orchestrateur |
| Transport réel, secrets réels, Unicode, volumétrie | ⏸️ non prouvés | — | voir « Ce qui n'est pas prouvé » |

## Résultats par famille (cas de `c0/fixtures/VERDICTS.json` rejoués)

| # | Famille | Tests | Cas rejoués | Résultat |
|---|---|---|---|---|
| 1 | Première activation | 1 | `F_SIMPLE_READY.activate_first` | ✅ ACK **octet pour octet** = `ack_s1.json` (forme canonique **et** fichier indenté à l'octet, horloge injectée = `now_utc` de la fixture) ; pointeur relu par une nouvelle connexion |
| 2 | FULL amputé / retraits légitimes | 2 | `F_FULL_CORRUPT.activate_base`, `full_amputated_self_consistent`, `legit_withdrawals_listed` | ✅ 202 `STAGE_HOLD` `UNEXPLAINED_WITHDRAWALS`, ancienne servie ; retraits listés activés ; ACK base = `ack_s10.json` |
| 3 | Intégrité | 4 | `hash_wrong`, `body_tampered_after_hash`, `manifest_counts_wrong`, `withdrawals_digest_wrong` | ✅ 422 au STAGE, 0 ligne `site_generation` ajoutée, refus journalisé |
| 4 | Médias | 4 | `media_missing`, `media_hash_mismatch`, `media_type_svg_declared`, `media_type_magic_mismatch` | ✅ pas d'ACK, pointeur inchangé ; PUT d'octets faux refusé 422 ; SVG déclaré refusé au STAGE (`semantic`), SVG sous mime PNG refusé à VERIFY (`media`) |
| 5 | Séquence | 4 | `sequence_stale`, `sequence_collision`, `replay_active` | ✅ 409 `STALE_SEQUENCE` / `SEQUENCE_COLLISION` ; REPLAY_ACK = octets stockés = `ack_s10.json` |
| 6 | Perte d'ACK | 1 | `F_SIMPLE_READY.replay_after_lost_ack` | ✅ même ACK malgré l'horloge à 07:00, 0 ligne de plus, journal `REPLAY_ACK second_effect:false` |
| 7 | Crash avant COMMIT | 1 | `legit_withdrawals_listed` | ✅ (a) exception dans le hook, (b) connexion PostgreSQL tuée (`pg_terminate_backend`) : 503, rollback complet, ancienne servie, `ACTIVATE_ABORTED` ×2 ; reprise = une bascule, aucune ligne en double |
| 8 | ACTIVATE concurrents | 11 | `activate_base` ×2 (5 tours), `sequence_collision` vs s10 (5 tours), attente du verrou observée | ✅ une seule bascule ; l'autre `REPLAY_ACK` (mêmes octets) ou `SEQUENCE_COLLISION` |
| 9 | Ancienne génération | 3 | `roll_forward_old_capture`, s10 réactivée après s11, restauration s12 | ✅ `CATALOG_UNSAFE` ; `STALE_SEQUENCE` et s10 reste `SUPERSEDED` ; restauration = nouvelle séquence 12 → ACTIVATED |
| 10 | Garde de retraits | 3 | `legit_withdrawals_listed`, `massive_listed_over_policy`, `massive_listed_released` | ✅ null/staging activé ; 5 sans libération → `RELEASE_REQUIRED` ; libération → ACTIVATED ; null/production → `RECEIVER_CONFIG_INVALID` (config et route, receiver jamais appelé) |
| 11 | Clés / scopes | 8 | `signature_wrong_scope`, `signature_retired_key`, `signature_unknown_key_id`, `signature_missing`, `signature_altered`, `rotation_verify_only_key` (+ `c0-test-events-01`) | ✅ 401 sur STAGE, MEDIA, VERIFY, ACTIVATE, STATUS ; `VERIFY_ONLY` activée ; aucun refus de signature ne change l'état |
| 12 | Replay octet pour octet | 2 | `replay_after_lost_ack`, `replay_active` | ✅ STAGE/VERIFY/ACTIVATE/STAGE → `REPLAY_ACK` = `ack_s1.json` / `ack_s10.json` |
| 13 | Journal | 1 | parcours mixte (8 cas) | ✅ ni `TEST_SECRET`, ni secret du trousseau, ni signature, ni nom/description/catégorie, ni octet PNG, ni e-mail ; clés de détail bornées ; UPDATE/DELETE/TRUNCATE refusés |
| — | `data_label` (C0 §15) | 3 | `activate_first`, `buy_price_leak`, `category_unknown`, s1 réétiqueté PRODUCTION | ✅ refus `envelope.data_label_environment` ; une faute `shape` prime ; aucune faute `semantic` ne passe avant |
| — | Interface `lib/site-db` | 2 | `activate_base`, `legit_withdrawals_listed` | ✅ `readActiveForUpdate` (FOR SHARE) retient l'activation jusqu'au COMMIT de l'appelant ; octets ACTIVE altérés → `UNSAFE` |

## Fichiers livrés (diff `5f69e742..0aa6bdc8`, hors `evidence/`)

- `package.json`, `package-lock.json` (`pg`, `@types/pg` 8.23.1 ; scripts `bc2:build`, `test:bc2`, `db:create-local`, `db:migrate`), `.gitignore` (`/.bc2-build/`), `tsconfig.bc2.json`
- `scripts/db/create-local.sh`, `scripts/db/migrate.mjs`, `db/migrations/001_site_generation.sql`, `002_site_active_pointer.sql`, `003_site_media.sql`, `004_site_publication_log.sql`
- `db/migrations/005_site_generation_immutable.sql` (correctif F-02)
- `lib/site-db/pool.ts`, `lib/site-db/generation.ts`
- `lib/site-publish/config.ts`, `lib/site-publish/receiver.ts`, `lib/site-publish/http.ts`
- `app/api/site/publish/{stage,verify-media,activate,status}/route.ts`, `app/api/site/publish/media/[sha256]/route.ts`
- `tests/bc2/helpers.mjs`, `tests/bc2/01…17_*.test.mjs`, `tests/bc2/http-smoke.mjs`, `tests/bc2/http-body-limits.mjs`
- `docs/SITE_DB_SCHEMA.md`, `docs/SITE_TRANSPORT_STAGING.md`

Aucun fichier de `c0/`, `components/`, `lib/site-dto`, ni de `app/` hors `app/api/site/publish/**`.

## Décisions prises (réversibles, à challenger en review)

1. **STAGE évalue avec un store média vide** : il s'arrête au plus tôt à `media` ; l'ACK qu'une évaluation à blanc pourrait
   produire (snapshot sans média) est jeté. Les médias ne se jugent qu'à VERIFY_MEDIA/ACTIVATE.
2. **ACTIVATE revérifie les médias en base** et peut activer une génération `STAGED` dont les médias sont conformes sans
   VERIFY_MEDIA préalable. L'activation sans média vérifié reste impossible (étape C0 `media` dans la transaction).
   Alternative : exiger `VERIFIED` (code de transport à inventer) — question au reviewer.
3. **Colonnes et contraintes ajoutées au schéma minimal** : `ack_bytes` (octets de l'ACK, base du REPLAY littéral), index
   unique partiel « une seule ACTIVE », contraintes ACK/ACTIVE, déclencheurs append-only et « ligne unique ».
4. **Statut HTTP** = HTTP indicatif §13 du premier code de la liste triée ; `SCHEMA_UNSUPPORTED` → 400 (pas 415).
5. **Erreurs de transport hors C0** (`REQUEST_INVALID`, `MEDIA_PATH_INVALID`, `GENERATION_NOT_STAGED`,
   `MEDIA_SIZE_OUT_OF_RANGE`, `ACTIVATION_ABORTED`, `RECEIVER_UNAVAILABLE`, `RECEIVER_CONFIG_INVALID`,
   `SITE_DB_CONFIG_INVALID`) dans un champ `transport_error` distinct de `error_codes` : aucun code C0 inventé.
6. **STATUS** est authentifié par la signature de publication de la génération (même en-têtes) ; clé hors scope → 401
   avant toute lecture, génération inconnue → 404 (révèle l'existence d'un couple publication/séquence à un porteur de
   clé valide seulement).
7. **Contrôle `data_label`** placé après l'évaluation C0 quand celle-ci a dépassé `shape`, étape nommée `environment`.
8. **`UNSAFE`** dérivé en lecture (incohérence pointeur/ligne/octets), fail-closed ; aucun marquage opérationnel.
9. **PUT média réparateur** : des octets vérifiés remplacent une ligne `site_media` altérée (`REPAIRED`).
10. Refus de signature : aucun changement d'état ; une ligne `ACTIVE`/`SUPERSEDED` n'est jamais modifiée par un refus ;
    `HOLD`/`REJECTED` restent réévaluables (ex. libération de la garde par configuration).
11. `readActiveForUpdate` prend `FOR SHARE` (nom imposé par le mandat conservé) ; `lock_timeout` 15 s à l'activation.
12. Tests : receiver compilé en CommonJS (`tsconfig.bc2.json` → `.bc2-build/`, ignoré par Git) pour `node --test` sur
    `.mjs` ; `--test-concurrency=1` (une base de test, remise à zéro par fichier). Les stores des cas `media_missing` et
    `media_hash_mismatch` sont reproduits par écriture directe en base (perte/corruption simulée), le PUT refusant
    lui-même des octets faux. La restauration s12 (famille 9) est un document synthétique construit avec les fonctions C0
    (`payloadSha256`, `withdrawalsDigest`, `sign`), pas un cas de `VERDICTS.json`.
13. Attribution des commits : `Co-Authored-By: Claude Opus 5.5` (modèle réellement utilisé, consigne de l'orchestrateur)
    au lieu de « Claude Fable 5.1 » écrit dans `COMMON.md` — même écart que A1 (D7).
14. `/budget` non lancé : lot délégué par l'orchestrateur, aucune sous-délégation.

## Correctifs de review (review indépendante `REVIEW_FIX_REQUIRED` à `a9dede14` : 0 bloquant, 1 majeur, 3 mineurs)

| Finding | Correctif | Commit(s) | Preuve |
|---|---|---|---|
| **F-01 MAJEUR** corps lu en entier avant tout plafond et toute authentification | `lib/site-publish/http.ts` : (1) **porte de transport sans lire le corps** — clé connue de scope `site_snapshot.publish`, `ACTIVE`/`VERIFY_ONLY`, signature 64 hex, sinon 401 ; (2) **lecture bornée en flux** par route — `Content-Length` > plafond → 413 immédiat, sinon compteur, flux interrompu au premier octet au-delà → 413 `BODY_TOO_LARGE`. Plafonds : STAGE 32 MiB, PUT média 20 MiB, VERIFY_MEDIA/ACTIVATE 256 KiB, STATUS corps jamais lu. **Décision journal** : aucune ligne pour les 401 de la porte, les 401 HMAC avant verrou et les 413 ; les refus rendus par l'évaluation C0 après la porte restent journalisés (une ligne bornée) | `9fe6c4e6`, tests `698bc667`, `5663f303`, `013a678d` | test 16 (en processus : 401 sans lire plus d'1 MiB d'un flux de 100 MiB ; 413 sur `Content-Length` sans lecture ; flux coupé ≤ plafond + 2 MiB ; plafond exact accepté ; 0 ligne de journal) ; serveur réel ci-dessous |
| F-02 MINEUR ACTIVE corrompue utilisée comme base | `loadActive` applique le contrôle de `getActiveGeneration` (ligne `ACTIVE`, pointeur = ligne, octets canoniques, SHA recalculé) ; ACTIVE `UNSAFE` → `409 CATALOG_UNSAFE`, `stage: "active_integrity"`, journalisé, aucune activation par-dessus (STAGE, VERIFY_MEDIA, ACTIVATE) ; migration 005 : `snapshot_bytes`, `snapshot_json`, `transport_json`, `payload_sha256`, séquence, identité et ACK posé immuables (`BEFORE UPDATE`) | `50b6eb45`, `9fe6c4e6` | test 16 F-02 (corruption simulée par le propriétaire, déclencheur désactivé puis réactivé ; reprise après restauration des octets) ; écritures refusées ×4 |
| F-03 MINEUR travail et verrous avant le refus de signature | VERIFY_MEDIA/ACTIVATE : clé (401) → génération connue (404) → HMAC du contexte §7 de la génération stockée (401), **avant tout verrou**, sans journal ; l'évaluation C0 complète reste inchangée ensuite | `9fe6c4e6` | test 16 F-03 (401 avant 404 ; 401 en < 1 s alors qu'un verrou exclusif est tenu sur le pointeur ; 0 ligne de journal) |
| F-04 MINEUR hôte de base non contrôlé | `siteDatabaseName` (pool et migrateur) : hôte `localhost`/`127.0.0.1`/`::1` sauf `SITE_ALLOW_REMOTE_DB=1` ; `jarvis…` toujours refusé ; paramètres `host`, `hostaddr`, `options`, `dbname`, `database`, `service`, `servicefile` refusés | `2ee2bbbe` | test 16 F-04 (10 URLs refusées, 3 acceptées, dérogation explicite) ; `raw/db_setup.txt` |
| F-05 NOTE | `snapshot: Snapshot \| null`, `null` dès que `UNSAFE` ; contrat documenté | `50b6eb45` | test 15 |
| F-06 NOTE | non implémenté : `UNSAFE` ne couvre pas les médias de l'ACTIVE, dette documentée (BC3 doit revérifier le SHA à la lecture de `/media/[sha256]`) | `7bcd2f43` (doc) | — |
| F-07 NOTE | `.gitignore` et `tsconfig.bc2.json` conservés, signalés dans le tableau | — | — |
| F-08 NOTE | rejeu de signature média : documenté dans le transport (sans effet par adressage par contenu) | `7bcd2f43` | — |
| F-09 NOTE | inchangé : le rôle propriétaire peut désactiver déclencheurs append-only/immutabilité (dette documentée ; les tests F-02 s'en servent pour simuler une corruption) | `7bcd2f43` (doc) | — |
| Complément orchestrateur (constat BC4) : connexion coupée en transaction | `withTransaction` (`lib/site-db/pool.ts`, utilisé par BC4) n'avait **pas** d'écouteur `error` : une connexion tuée arrêtait le processus. Écouteur ajouté, client détruit (`release(true)`). L'ACTIVATE l'avait déjà. | `fed1a641`, tests `522ed1df` | test 17 (connexion d'ACTIVATE tuée pendant l'attente du verrou → 503 `ACTIVATION_ABORTED` `57P01`, pas d'ACK, 0 exception non capturée, activation suivante OK ; `withTransaction` tuée → rejet, pool réutilisable) ; H05b HTTP (serveur vivant, H07 réussit ensuite) ; mutation : 2/2 échouent sans écouteur |

**Mesures F-01 sur serveur réel** (`next start` port 3331, base `prodes_site_bc2`, RSS par `ps -o rss=` toutes les 20 ms,
`raw/http_body_limits_3331.txt`) — référence review à `a9dede14` : +278 MiB pour un STAGE de 100 MiB non authentifié,
3,17 GiB retenus après ~1,8 GiB envoyés :

| Envoi (100 MiB proposés) | Code | Octets acceptés par le serveur avant refus | Pic RSS |
|---|---|---|---|
| STAGE sans en-têtes (avec / sans `Content-Length`) | 401 | ~2 MiB (tampons réseau) | +0,6 / +1,1 MiB |
| STAGE signé, `Content-Length` 100 MiB | 413 | ~2 MiB | +0,0 MiB |
| STAGE signé, flux sans longueur | 413 | ~37 MiB (plafond 32 MiB + tampons) | +43,2 MiB |
| VERIFY_MEDIA signé (flux) / ACTIVATE signé (`Content-Length`) | 413 | ~2 MiB | +0,0 / +0,0 MiB |
| PUT média signé, flux | 413 | ~23 MiB (plafond 20 MiB) | +34,7 MiB |
| PUT média sans en-têtes | 401 | ~2 MiB | +0,0 MiB |
| 12 rafales de 4 STAGE signés de 100 MiB en parallèle | 413 ×48 | ~1,9 GiB au total | rafale 1 : +85 MiB ; rafale 12 : +0,3 MiB |

Critère retenu : **pas de rétention proportionnelle aux octets reçus**. Plateau entre les rafales 6 et 12 : +5,9 MiB pour
952 MiB envoyés (0,6 %) ; RSS finale − initiale : +229,9 MiB pour 1 942 MiB envoyés (11,8 %) ; journal 10 → 10 lignes.
Même scénario avec un serveur à tas JS plafonné (`--max-old-space-size=128`) : 22/22, plateau +23,8 MiB pour
933 MiB (2,6 %), finale +223,3 MiB (11,5 %), serveur vivant. Le résidu dépasse le plafond du tas : c'est de la mémoire
native/allocateur non rendue au système, pas des références JS retenues. **Un seuil absolu de RSS n'est pas
revendiqué** : une première version du test avec seuils absolus a échoué sur des runs où le plateau variait
(+17 à +129 MiB entre rafales), sans croissance linéaire ; le critère a été remplacé par la proportion (commits
`5663f303` → `013a678d`), les sorties intermédiaires n'ont pas été conservées.

## Ce qui n'est pas prouvé

- **Transport réel** : HTTPS, authentification de production, anti-rejeu horodaté, débit et concurrence par client.
- **Secrets réels**, stockage et rotation ; HMAC → signature asymétrique de l'ACK (DF-0093) ; énumérabilité (DF-0092).
- **Unicode** : divergence NFC Python 3.11 (Unicode 14) / Node 22 (Unicode 17) non traitée (DF-0089) ; corpus ≤ Unicode 14.
- **Volumétrie** : FULL 2–3 k Items, snapshots proches de 32 MiB, médias de 20 MiB, nombre de générations conservées.
- Crash du **processus Node** lui-même (simulé par exception et par connexion PostgreSQL tuée), échec du COMMIT
  lui-même, expiration `lock_timeout`, plusieurs instances Next concurrentes (le verrou est en base, non testé à
  plusieurs processus), interaction réelle avec BC4/BC5 (BC5 n'a pas encore envoyé), Windows/JARVIS, charge prolongée.
- Seuil de retraits de production (DF-0090) : seules les valeurs de fixtures (`null`, `5`) sont utilisées.

## Dettes découvertes (candidates NON-OUBLI, non clôturées)

- RSS résiduelle de ~230 MiB après des rafales de corps maximaux (allocateur natif) : bornée, non proportionnelle, mais
  à surveiller avant exposition ; limitation de débit et de concurrence par client `DEFERRED_FOR_PROD`.
- Un tiers qui connaît un `key_id` (non secret) peut encore écrire une ligne de journal par STAGE ≤ 32 MiB refusé par C0.
- `UNSAFE` ne couvre pas les médias de l'ACTIVE (F-06).
- Rétention/purge des générations `SUPERSEDED`/`REJECTED` et des médias orphelins : aucune.
- Valeur `STATUS` admise par le `CHECK` de `site_publication_log.operation` mais jamais écrite.
- Le rôle de test possède les bases (droits fins à concevoir avant toute base partagée).
- Test de mutation non scripté (rejeu manuel décrit dans `raw/mutation_no_pointer_lock.txt`).

## Questions `REQUIRES_OWNER_DECISION`

1. **Seuil de garde des retraits en production** (`max_withdrawals_without_release`, C0 §16.4, DF-0090) : aucune valeur
   choisie ; un receiver `production` refuse de fonctionner tant qu'elle n'est pas fixée.
2. **Marquer une génération ACTIVE « UNSAFE »** (qui le décide, par quel geste) : le statut existe côté C0 business
   (`CATALOG_UNSAFE`) mais aucun geste opérationnel n'est prévu ; BC2 ne le dérive que d'une incohérence technique.
3. **Rétention** des anciennes générations et des médias (durée, purge) — affecte la capacité de restauration
   (ROLL_FORWARD = republication par la Factory, pas de re-pointage).

Décision 2 (ACTIVATE sans VERIFY_MEDIA préalable) : jugée acceptable par la review (§6) ; `VERIFIED` documenté comme
informatif dans `docs/SITE_TRANSPORT_STAGING.md`.
