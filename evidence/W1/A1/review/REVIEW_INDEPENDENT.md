# Review indépendante — lot A1 (Commerce D : dépendances durcies + C0 TypeScript vendu)

Reviewer indépendant (n'a pas construit le lot). Worktree détaché `/Users/nico/Desktop/prodes-w1/review-a1`, HEAD
`918e5437803f4c2319d078a12ba0976dc76f686e` (SHA final du builder, branche `build/site-d-foundation`, base `a86ae1bb`).
Environnement : macOS, Node v22.23.1, npm 10.9.8 (Node v20.19.5 en plus pour F-06), port 3322 uniquement (PID 56776, tué par PID, port libéré).
Aucun accès JARVIS, aucun `.env*`, aucun checkout Extractor, aucune écriture dans le dépôt Factory (lecture seule : `git rev-parse`, `git archive`, `git diff`, `git log`).
Sorties brutes : `evidence/W1/A1/review/raw/` (39 fichiers, dont les scripts d'attaque `adv.sh`, `bis.sh`, `sync_adv.sh`, `mm.sh`, `syn.sh`).
Mandats lus : `REVIEW_TEMPLATE.md`, `COMMON.md`, `A1_C0_FOUNDATION.md` + correctif (re-vendoring depuis `7a5ac012`, `frozen_code_sha=b88f5cdf…`, contrôle `C0_FROZEN_CODE_MISMATCH`, test (d)).

## Verdict : `REVIEW_PASS` (0 bloquant, 0 majeur ; 6 MINEUR et 6 NOTE ouverts, dont 3 MINEUR à solder avant que A2 ne s'appuie sur `c0:check`)

Statut maximal confirmé : `TESTED_SYNTHETIC` (rien d'`INTEGRATED_REAL`, rien déployé).

## 1. Rejeu (au SHA `918e5437`, états propres)

| Commande | Résultat rejoué | Preuve brute |
|---|---|---|
| `npm ci` | exit 0, 49 paquets ajoutés, 0 vulnérabilité | `raw/npm_ci.txt` |
| `env -i PATH=$PATH HOME=$HOME npm run build` | exit 0, Next.js 16.4.2 (Turbopack), 9 routes, aucun avertissement (ni lockfile multiple ni racine de workspace) | `raw/build.txt` |
| `npm run typecheck` | exit 0 | `raw/typecheck.txt` |
| `npm audit --json` | exit 0, info/low/moderate/high/critical = 0, total 0 | `raw/npm_audit.json` |
| `npm ls next react react-dom typescript` | exit 0 : next 16.4.2, react 19.3.0, react-dom 19.3.0, typescript 5.9.3 ; pas de `^`/`~` dans `package.json` | `raw/npm_ls.txt` |
| `npm run c0:check` | `C0_VENDOR_OK sha=b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 files=452 tree_digest=b73f1968…509c5d` | `raw/c0_check.txt` |
| `npm run c0:build && npm run c0:test` | exit 0 ; 9 tests, 9 pass, 0 fail, 0 skip | `raw/c0_build_test.txt` |
| `npm run c0:vendor-test` | 4 tests, 4 pass, 0 fail, 0 skip ((a) OK, (b) drift, (c) SHA gelé, (d) `C0_FROZEN_CODE_MISMATCH`) | `raw/c0_vendor_test.txt` |
| Serveur `node_modules/.bin/next start -H 127.0.0.1 -p 3322` + `BASE_URL=http://127.0.0.1:3322 PHASE=default node spike/http-tests.mjs` | `66/66 PASS, 0 FAIL`, exit 0 ; seul écart avec `spike/logs/http-tests-default.log` : l'identifiant aléatoire de reçu `SIM-DEV-…` (S07-first, S07-replay), identique au constat du builder ; serveur arrêté par `kill 56776`, port 3322 libre | `raw/http_tests_default_3322.txt`, `raw/server_pid.txt` |
| `npm run agent-ops:test` (non-régression ; le builder ne l'avait pas rejoué au SHA final) | 15/15, 0 skip | `raw/agent_ops_test.txt` |
| `npm install --package-lock-only` puis `git diff package-lock.json package.json` | diff vide : lockfile cohérent avec `package.json` ; `npm ci --dry-run` OK | `raw/npm_lock_only.txt` |
| `git status` du worktree après build/test | seul `evidence/W1/A1/review/` non suivi : aucun fichier suivi altéré par `build`/`c0:*` | — |

Suite Django / `check_skips` / `verify_source_manifest` / `non_oubli` : `NOT_REPLAYED` (lot Commerce, aucun code Factory ; le mandat ne les demande pas pour A1).
`compare_verdicts.py` (parité Python↔TS) : `NOT_REPLAYED` (hors mandat A1, comme déclaré par le builder).
PHASE `promo`/`before` des tests HTTP : `NOT_REPLAYED` (non demandées).

## 2. Avis Next.js (vérifié via `gh api`, 2026-10-23)

| Avis | Sévérité | Plages affectées | Corrigé en | `next@16.4.2` concerné ? |
|---|---|---|---|---|
| GHSA-2464-fhr4-w9xw (RCE non authentifiée, Image Optimization / SVG) | critical | `>=10.0.0 <=15.5.27` ; `>=16.0.0 <=16.4.0` | 15.5.28 ; **16.4.1** | Non |
| GHSA-673q-mjm6-r5xr (RCE non authentifiée, fonctions `use cache` renvoyant des typed arrays) | critical | `>=16.0.0 <=16.4.0` | **16.4.1** | Non |
| GHSA-p3m5-59mp-jv5r (DoS App Router / Server Actions ; CVE-2026-94482) | high | `>=13.0.0 <=15.5.27` ; `>=16.0.0 <=16.4.0` | 15.5.28 ; **16.4.1** | Non |

`gh api "/advisories?ecosystem=npm&affects=next@16.4.2"` : 0 avis. Témoin positif `affects=next@16.4.0` : exactement ces 3 avis.
`npm view next dist-tags` : `latest = 16.4.2` (stable, publié 2026-10-15T20:57Z) ; l'intégrité du `package-lock.json` (`sha512-r+oBJoj…`) est celle du registre.
Bonus : `next.config.ts` met `images.unoptimized: true` (réduit la surface du premier avis). Les avis ont été publiés le 2026-10-22 ; la vérification ne dit rien d'avis ultérieurs. Pièces : `raw/adv_*.json`, `raw/adv_affects_next_16.4.2.txt`.

## 3. Vendoring — recalcul indépendant

- **Empreintes** : script Python indépendant (os.walk, hashlib) : 452 fichiers hors `C0_SOURCE.json`, `files` du manifeste identique, `file_count = 452`, `tree_digest` recalculé = `b73f1968252785007b1e0b27af603e9bae6966d1527d0c6666bc93ac5e509c5d` (égal au manifeste). `git ls-files c0` = 453 (452 + manifeste), aucun `dist`/`node_modules` suivi, aucun lien symbolique ni répertoire vide.
- **Octets vs Factory** : `git -C <factory> archive 7a5ac012 <7 chemins>` extrait dans mon scratch ; `diff -r -x C0_SOURCE.json -x dist -x node_modules c0 <archive>` : **identique**. Contre `b88f5cdf` : seul `c0/README.md` diffère (ligne de statut). Aucun fichier vendu édité à la main.
- **Re-sync indépendant** (`sync.mjs --dest <tmp>` depuis `7a5ac012`/gel `b88f5cdf`) : `C0_SOURCE.json` **identique octet pour octet** au manifeste commité, arbre identique, `check` OK (`raw/adversarial_sync.txt` S1). Le même sync depuis le HEAD du worktree Factory (`970588da`) donne le même `tree_digest`.
- **Quatre arbres code identiques entre `b88f5cdf` et `7a5ac012`** (`raw/frozen_trees.txt`) : `c0/ts/src 899b1af9…`, `c0/ts/test 64c20e6a…`, `c0/fixtures c2bf3496…`, `c0/python f2f0b118…`. `git diff --stat b88f5cdf 7a5ac012` : 8 fichiers, uniquement `c0/README.md`, 2 docs de contrat (lignes de statut `NOT_FROZEN`→`C0_FROZEN`, constaté sur le diff complet), `tests/seams/guards.py` et des fichiers `evidence/` ; `c0/python c0/ts/src c0/ts/test c0/fixtures` vide.
- **Registre de verdicts** : `c0/ts/dist/verdicts.ts.json` (reconstruit par `c0:build` + `c0:test`, mtime frais) = `5abb6b69775bb73151f544e54e68d672729f00813e8a7400b1ad59334501dc90` ; fichier du worktree Factory = même hash ; **régénération indépendante** (archive `7a5ac012` dans mon scratch, `npm ci && npm run build && npm test` dans `c0/ts`, 9/9) = même hash (`raw/factory_regen_verdicts_sha.txt`). Le registre est donc produit par le code vendu (compilé ici), non copié ; il ne contient aucun chemin absolu.
- **Lecture de `sync.mjs` / `check.mjs` / `lib.mjs`** (SHA-256 des fichiers audités : `raw/audited_files_sha256.txt`) : points solides — SHA complets obligatoires, `rev-parse --verify`, comparaison tree git par chemin (octets et modes), `ls-tree` n'accepte que `100644 blob` (symlink et `100755` refusés, vérifié), extraction dans une zone de transit puis comparaison de chaque fichier à son blob git (neutralise `export-subst`/`export-ignore`/conversions d'eol), `lstat` (pas de suivi de liens), `execFileSync` sans shell (pas d'injection), `parseArgs` strict. Failles et limites : F-01 à F-05 ci-dessous.

## 4. Périmètre et ownership

`git diff --name-only a86ae1bb..918e5437` : `package.json`, `package-lock.json`, `.gitignore`, `scripts/c0/{lib,sync,check}.mjs`, `tests/c0/vendor.test.mjs`, `docs/C0_VENDORING.md`, `c0/**` (452 + manifeste), `evidence/W1/A1/**`. **Aucun fichier hors périmètre** (le filtre `grep -v` du mandat renvoie vide). `app/`, `components/`, `lib/`, `fixtures/`, `next.config.ts`, `tsconfig.json`, `spike/` : diff vide ; `fixtures/provisional-v0/` toujours présent (9 fichiers). Aucun code applicatif ne référence `c0` (aucune réimplémentation d'une règle C0 hors `c0/`, aucun import de C0 : c'est le périmètre d'A2). `package.json` : seulement `next` 16.4.0→16.4.2, `typescript` 7.0.2→5.9.3, 5 scripts `c0:*`. `package-lock.json` : aucun paquet ajouté ; changés = `next` + 9 `@next/*` (16.4.0→16.4.2) + `typescript` ; retirés = 20 binaires natifs `@typescript/*` de TS 7. Aucune dépendance ajoutée.

## 5. Conformité au contrat

A1 ne touche aucune règle ni code d'erreur C0 : il ne fait que transporter les octets. Contrat v1 non modifié : `c0/` ≡ archive Factory (§3), aucun `docs/contracts/c0_*.md` n'est dans le diff. Écart de texte d'archive à noter : la ligne de contrôle littérale du mandat (`git diff --stat … docs/contracts` vide) ne l'est pas entre `b88f5cdf` et `7a5ac012` (2 docs, statut seulement) — décision D1/D8 du builder, arbitrée par l'orchestrateur, **cohérente avec ce que j'ai relu**.

## 6. Cas adversariaux exécutés (29 cas ; sorties : `raw/adversarial_*.txt`)

Contrôle `check.mjs --root <copie temporaire>` (jamais sur le worktree) :

| # | Attaque | Résultat observé | Verdict |
|---|---|---|---|
| A1 | témoin intact | `C0_VENDOR_OK … files=452` | OK |
| A2bis | 1 bit inversé dans `fixtures/media/simple_family.png` | `C0_VENDOR_DRIFT … MODIFIED`, exit 1 (A2 initial = `dd` sans effet de ma part, invalide, remplacé) | détecté |
| A21 | 1 bit inversé dans `documents/F_SIMPLE_READY/snapshot_s1.json` | `MODIFIED`, exit 1 | détecté |
| A3 | `ts/src/signing.ts` modifié | `MODIFIED`, exit 1 | détecté |
| A20 | CRLF sur `ts/src/errors.ts` | `MODIFIED`, exit 1 | détecté |
| A4 | fichier ajouté `c0/ts/src/extra.ts` | `ADDED`, exit 1 | détecté |
| A19 | `c0/fixtures/C0_SOURCE.json` en sous-dossier | `ADDED`, exit 1 | détecté |
| A5 | fichier supprimé | `MISSING`, exit 1 | détecté |
| A6 | clé supprimée de `files` du manifeste | `tree_digest incohérent`, exit 1 | détecté |
| A11 / A12 | lien symbolique ajouté / lien nommé `dist` | `UNSUPPORTED`, exit 1 | détecté |
| A15 / A16 | manifeste absent / JSON invalide | `C0_VENDOR_DRIFT`, exit 1 | détecté |
| A7 | fixture modifiée **et** `files` + `tree_digest` du manifeste recalculés de façon cohérente | `C0_VENDOR_OK`, exit 0 | **non détecté** (F-02) |
| A8 | `frozen_code_sha` remplacé par `000…001` | `C0_VENDOR_OK sha=000…001`, exit 0 | non détecté par `check` (seul le test (c) le voit) (F-02) |
| A18 | `frozen_code_identity.trees` remplacé par `aaa…` | `C0_VENDOR_OK` | non détecté (F-02) |
| A9 | fichier dans `c0/ts/src/node_modules/evil/index.ts` | `C0_VENDOR_OK` | **non détecté** (F-01) |
| A10 | fichier dans `c0/fixtures/dist/forged.json` | `C0_VENDOR_OK` | **non détecté** (F-01) |
| A22 | copie d'un cas dans `c0/fixtures/cases/dist/hidden_copy.json` | `check` : OK ; mais `c0:test` : 8/9, `not ok 1 - every case matches its declared verdict…` (le runner parcourt `cases/` récursivement) | `check` aveugle, `c0:test` rattrape (F-01) |
| A13 | répertoire vide ajouté | `C0_VENDOR_OK` | non détecté (NOTE F-09) |
| A14 | `chmod +x` sur une fixture | `C0_VENDOR_OK` | non détecté (NOTE F-09 ; Git versionne le mode) |
| A17 | `c0` remplacé par un lien symbolique vers une copie | `C0_VENDOR_OK` | non détecté (NOTE F-09 ; Git montre le changement de type) |

`sync.mjs` (Factory réel ou dépôt Git synthétique, `--dest` temporaire) :

| # | Attaque | Résultat | Verdict |
|---|---|---|---|
| S1 | re-sync `7a5ac012`/gel `b88f5cdf` | manifeste et arbre identiques à ceux commités | reproductible |
| S2 | `--sha 9f5d4a0e…` (commit Factory réel dont fixtures, python et ts/src diffèrent du gel) | `C0_FROZEN_CODE_MISMATCH` + 3 lignes de trees, exit 1, dest vide | refusé, rien écrit |
| S10 (synthétique) | modif seule de `c0/python`, de `c0/ts/test`, de `c0/fixtures`, de `c0/ts/src`, ajout d'un fichier dans `ts/src` | `C0_FROZEN_CODE_MISMATCH` à chaque fois, dest vide | refusé |
| S10b | modif seule de `c0/ts/package.json` | `C0_SYNC_OK` | accepté (F-04) |
| S10c | symlink (`120000`) ou exécutable (`100755`) dans `c0/fixtures` à `--sha` | `C0_SYNC_FAILED entrée non prise en charge`, dest vide | refusé |
| S3 / S4 / S7 | SHA abrégé / SHA gelé inconnu / option inconnue ou valeur manquante | `C0_SYNC_FAILED …`, exit 1 | refusé proprement |
| S5 / S6 | `--sha` inexistant / `--factory` non dépôt Git | exit 1 mais **trace de pile Node brute**, pas de `C0_SYNC_FAILED` | fail-closed, présentation (F-03) |
| S9 | dest avec `c0/` préexistant contenant `dist/` et un fichier parasite | `c0/` remplacé en entier (parasite et `dist/` disparus), `check` OK | conforme |
| — | sans `--frozen-sha`, `--sha` = commit non gelé | accepté, `frozen_code_sha` = ce commit | limite documentée (NOTE F-10) |

Autres attaques de la liste du mandat de review : `package-lock` cohérent avec `npm ci` (voir §1, diff vide) ; absence de `.env*` (`git ls-files | grep -i '(^|/)\.env'` vide, aucun `.env*` dans le worktree, build sous `env -i`) ; aucune dépendance ajoutée (§4) ; `engines` (F-06).

## 7. Sécurité

- `grep -rn TEST_SECRET_NOT_FOR_PRODUCTION` (hors `node_modules`, `.next`, `.git`, ma review) : hits uniquement dans `c0/fixtures/keys/` (1 fichier), `c0/fixtures/documents/` (4), `c0/fixtures/cases/` (3) et `c0/README.md` (1). **Aucun hit hors `c0/`.** Le critère « seulement `c0/fixtures/keys/` » du mandat était trop étroit : des fixtures de clé invalide et d'access_token de test portent aussi le marqueur ; tout est synthétique et étiqueté (NOTE F-11). `raw/secret_grep_paths.txt`.
- Aucun chemin JARVIS, `LOCALAPPDATA`, jeton (`ghp_`, `github_pat_`, `sk-`, `Bearer`), ni `ssh` dans `scripts/c0`, `tests/c0`, `docs/C0_VENDORING.md`, `package.json`, `.gitignore`, `c0/C0_SOURCE.json`, `evidence/W1/A1/`, ni dans `c0/`.
- Aucune route ajoutée ; `next.config.ts` inchangé (en-têtes `X-Frame-Options`, `nosniff`, etc. conservés). Le build n'a besoin d'aucune variable d'environnement.
- Scripts : pas de shell (`execFileSync`), pas de chemin construit à partir de données non fiables hors `--dest`/`--factory` fournis par l'opérateur ; le contenu tar est vérifié contre les blobs git avant d'être posé.

## 8. Qualité de preuve (chaque ✅ du REPORT contre la sortie brute)

Confirmés au SHA `156bc548` (état code final, `918e5437` n'ajoute que `evidence/`) et rejoués par moi : Next/TS/React épinglés, avis, audit 0, `npm ci`, build, typecheck, HTTP 66/66, `c0:check`, `c0:build`/`c0:test` 9/9, `vendor.test` 4/4, parité SHA-256, `C0_SOURCE.json`, sync depuis `7a5ac012`, idempotence, non-régression `agent-ops:test`. Statut annoncé (`TESTED_SYNTHETIC`) ≤ environnement testé (macOS/Node 22 seulement, déclaré dans « Tests non exécutés »). `UNKNOWN` respecté.
Écarts de preuve (F-07) : PID du REPORT ≠ PID brut ; `advisories_gh_api.txt`, `npm_view_versions.txt` et `agent_ops_test.txt` n'ont pas d'en-tête de SHA (ce dernier a été produit avant `5eb49ba8`, l'écart est avoué dans le REPORT) ; la preuve du refus `C0_FROZEN_CODE_MISMATCH` sur Factory réel (`--sha 84a49dcb`, commit sans `c0/` : 4 trees `ABSENT`) est dégénérée ; je l'ai refaite avec un vrai commit divergent (S2) et un dépôt synthétique (S10), le comportement est bon.

## 9. Findings

### F-01 — MINEUR — `check.mjs` n'inspecte pas `dist/` ni `node_modules/` à toute profondeur
`lib.mjs:walkC0` ignore tout répertoire nommé `dist` ou `node_modules` à n'importe quel niveau de `c0/`. Reproduction : `raw/adversarial_check.txt` A9/A10 et `raw/adversarial_check_bis.txt` A22 : un fichier posé dans `c0/fixtures/cases/dist/` est **consommé** par le runner TS (`walk()` récursif de `c0/ts/src/runner.ts:126`) alors que `c0:check` répond `C0_VENDOR_OK`. Atténuations : `c0:test` passe alors en rouge (8/9), Git montre le fichier (seuls `/c0/ts/dist/` et `/c0/ts/node_modules/` sont ignorés, plus `/node_modules` racine), et le texte du mandat disait « hors dist/, node_modules/ » sans préciser la profondeur — d'où MINEUR et non MAJEUR.
Correction attendue : n'exclure que `c0/ts/dist` et `c0/ts/node_modules` (chemins relatifs exacts) dans `walkC0` ; ajouter à `vendor.test.mjs` un cas « fichier sous `c0/fixtures/cases/dist/` → `ADDED` ».

### F-02 — MINEUR — `check.mjs` prouve « `c0/` = manifeste », pas « manifeste = Factory »
Un manifeste forgé de façon cohérente (A7 : octet modifié + `files` + `tree_digest` recalculés) passe `C0_VENDOR_OK` ; `frozen_code_sha` et `frozen_code_identity.trees` peuvent être réécrits (A8, A18) sans que `check` s'en aperçoive ; seul le test (c) pin `frozen_code_sha` (pas `tree_digest`, pas `archived_from_sha`, pas les `trees`). Le but « une seule autorité, zéro fork » n'est donc garanti que par la relecture du diff `c0/C0_SOURCE.json` en revue.
Correction attendue (au choix, la première suffit) : (i) pinner dans `vendor.test.mjs` `tree_digest`, `archived_from_sha` et les 4 `trees` attendus (modifiés uniquement dans le commit de re-sync revu) ; (ii) mode `check.mjs --factory <dépôt> ` qui refait le `git archive` et compare les octets (c'est exactement ce que j'ai fait à la main en §3) ; documenter la limite dans `docs/C0_VENDORING.md`.

### F-03 — MINEUR — `sync.mjs` : SHA inconnu ou dépôt invalide = trace de pile non gérée
`--sha 2222…` (S5) et `--factory /tmp` (S6) : exit 1, rien écrit, mais exception Node brute (`Error: Command failed … at genericNodeError`) au lieu de `C0_SYNC_FAILED <message>`. La ligne `git rev-parse --verify` n'est pas enveloppée (contrairement à celle du SHA gelé).
Correction attendue : `try/catch` autour du premier `rev-parse` et des appels `ls-tree`/`archive` avec message `C0_SYNC_FAILED`.

### F-04 — MINEUR — les fichiers de configuration vendus échappent au contrôle d'identité du gel
`FROZEN_CODE_PATHS` ne contient pas `c0/ts/package.json`, `c0/ts/tsconfig.json`, `c0/ts/package-lock.json` (et `c0/README.md`, volontairement). Reproduction : dépôt synthétique, modification seule de `c0/ts/package.json` entre le SHA gelé et le SHA archivé → `C0_SYNC_OK` (`raw/adversarial_sync_synthetic.txt`). Aujourd'hui sans effet : `git diff --stat b88f5cdf 7a5ac012` ne les touche pas (vérifié) et le builder l'a documenté (D8). Latent : un durcissement/relâchement de `strict` ou de `target` dans `tsconfig.json` passerait sous le contrôle du gel.
Correction attendue : ajouter ces trois fichiers à un second contrôle d'identité (mêmes blobs aux deux SHA) ou les inclure dans `FROZEN_CODE_PATHS`.

### F-05 — NOTE — la parité de registre n'est pas dans les scripts
Le SHA-256 du registre (`5abb6b69…`) n'est vérifié que par des commandes manuelles du REPORT/`replay_gates.sh` ; ni `c0:test` ni `vendor.test.mjs` ne le comparent à une valeur attendue. Si la parité doit rester vraie à chaque re-sync, pinner le hash attendu dans le test de A2 ou de l'intégration (il change seulement avec une v2).

### F-06 — MINEUR — `engines.node >=20.9.0` annoncé, mais `c0:test` et `c0:vendor-test` échouent sous Node 20
Reproduction (Node 20.19.5, `raw/node20_c0_test.txt`, `raw/node20_vendor_test.txt`) : `node --test "c0/ts/dist/test/*.test.js"` → `Could not find '…/*.test.js'` (les globs de `node --test` n'existent qu'à partir de Node 21) ; idem `tests/c0/*.test.mjs`. `check.mjs` et `c0:build` fonctionnent sous Node 20. Le `c0/ts/package.json` vendu déclare lui-même `>=22`. Node 20 est en fin de vie (avril 2026), l'impact pratique est faible.
Correction attendue : passer `engines.node` à `>=22` (cohérent avec le jumeau), ou remplacer les globs par des chemins explicites/`node --test <dossier>`.

### F-07 — MINEUR — incohérences de preuve dans `REPORT.md`
(a) « PID 35980 » (REPORT, ligne tests HTTP) n'apparaît dans aucune sortie brute ; `raw/server_pid.txt` contient 48697 (ancien PID d'un run antérieur). (b) `raw/advisories_gh_api.txt`, `raw/npm_view_versions.txt`, `raw/agent_ops_test.txt` sans SHA testé. (c) preuve de refus `C0_FROZEN_CODE_MISMATCH` sur Factory réel avec un commit sans `c0/` (non représentative ; le test (d) synthétique et mes S2/S10 la compensent). Aucun ✅ n'est faux : tous ont été rejoués avec le même résultat.
Correction attendue : corriger le PID, ajouter l'en-tête de SHA/date aux trois fichiers (ou les marquer « non versionnés »), remplacer `84a49dcb` par un commit Factory réellement divergent (par ex. `9f5d4a0e…`).

### F-08 — NOTE — `sync.mjs` : remplacement non atomique de `c0/`
`rmSync(target)` précède `renameSync` : un échec entre les deux laisse le dépôt sans `c0/` (récupérable par `git checkout -- c0`). Préférer renommer l'ancien `c0/` en `c0.old`, poser le nouveau, puis supprimer l'ancien. Le commentaire du script parle de « renommage atomique » ; c'est seulement vrai du dernier pas.

### F-09 — NOTE — limites de `check.mjs` non couvertes
Répertoires vides, bit exécutable et racine `c0` remplacée par un lien symbolique ne sont pas détectés (A13, A14, A17) ; Git les montre au `git status`/`git diff`. Un `.DS_Store` dans `c0/` fait échouer le check (voulu, noté par le builder). Aucun hook ni CI ne lance `c0:check` : il n'y a pas de `.github/workflows` dans ce dépôt ; `npm run build` ne l'appelle pas. À câbler au moment de l'intégration (A2 / orchestrateur).

### F-10 — NOTE — `frozen_code_sha` est une déclaration de l'opérateur
Sans `--frozen-sha`, `frozen_code_sha = --sha`, donc `sync` peut estampiller n'importe quel commit comme « code gelé » (vérifié : `--sha 1a499776…` → `frozen_code_sha = 1a499776…`). Seul le test (c) bloque ce cas pour v1. À rendre obligatoire à la v2 (`--frozen-sha` requis).

### F-11 — NOTE — critère d'acceptation du grep secrets
Le mandat de review annonçait « hits uniquement dans `c0/fixtures/keys/` » ; réalité : aussi `c0/fixtures/{documents,cases}/` et `c0/README.md`, tous synthétiques et dans `c0/`. Aucun hit hors `c0/`. Ajuster le critère à « uniquement sous `c0/` ».

### F-12 — NOTE — hygiène du vendu
`c0/README.md` vendu (inchangé, c'est voulu) cite `c0/python`, `c0/tools`, des liens relatifs `../docs/contracts/…` qui n'existent pas dans Commerce, et conseille « copier ou référencer `c0/ts/src` » (ligne 58), contraire au mécanisme ; dette Factory déjà signalée par le builder (NON-OUBLI candidate). Le trailer des commits est `Claude Opus 5.5` au lieu de `Claude Fable 5.1` du `COMMON.md` : écart déclaré (D7) et « validé par l'orchestrateur » ; je ne peux pas le vérifier, à confirmer par l'orchestrateur.

## 10. Verdict

**`REVIEW_PASS`.** Les gates du mandat (dépendances, audit, build sans secret, typecheck, HTTP, `c0:check`, `c0:test` 9/9, `vendor-test` 4/4, parité de registre, `frozen_code_sha = b88f5cdf…`, périmètre, absence d'édition à la main) sont reproduites indépendamment, y compris la régénération du registre côté Factory et la comparaison octet à octet à `git archive 7a5ac012`. Aucun bloquant, aucun majeur.
À solder avant intégration (non bloquant pour clore A1) : **F-01** (exclusion de `dist`/`node_modules` à toute profondeur), **F-02** (pinner ou re-vérifier le manifeste contre Factory), **F-06** (`engines`). F-03, F-04, F-07 sont de petites corrections ; F-05 et F-08 à F-12 sont des notes.
Une re-review n'est pas requise si le builder ne corrige que F-01 à F-04 et F-06 par un commit limité à `scripts/c0/`, `tests/c0/`, `package.json` et `docs/C0_VENDORING.md` ; elle l'est si `c0/` est touché.
