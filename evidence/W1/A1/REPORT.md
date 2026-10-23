# W1 / A1 — Fondation Commerce D : dépendances durcies + C0 TypeScript vendu

**Statut annoncé : `TESTED_SYNTHETIC`** (rien d'`INTEGRATED_REAL`, aucun déploiement).
Branche `build/site-d-foundation` (base `a86ae1bb`). Commit de code testé : **`fdbfe6a3`** (après correctif
orchestrateur — re-vendoring depuis `7a5ac012` — puis correctifs de la review indépendante `REVIEW_PASS` F-01…F-08,
`c0/` inchangé depuis `156bc548`) — toutes les gates ci-dessous ont été rejouées depuis un état propre (`node_modules`, `.next`, `c0/ts/dist` supprimés) sur ce commit par
`raw/replay_gates.sh`. Le commit qui ajoute ce rapport ne change que `evidence/`. Premier passage : `e8782bd1`
(mêmes résultats, `tree_digest` `749bff47…`, README vendu `NOT_FROZEN`).
Environnement : macOS, Node v22.23.1, npm 10.9.8, 2026-10-22T23:59Z (UTC).

## Résultats

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Next.js stable ≥ 16.4.2, épinglé | ✅ `16.4.2` | `raw/npm_ls.txt`, `raw/npm_view_versions.txt` (`latest` = 16.4.2, publié 2026-10-15T20:57Z) | 16.4.2 est la seule 16.x stable ≥ 16.4.2 au 2026-10-22 |
| Avis GHSA-2464-fhr4-w9xw / -673q-mjm6-r5xr / -p3m5-59mp-jv5r | ✅ corrigés | `raw/advisories_gh_api.txt` : API GitHub Advisories (`gh api /advisories/<id>`), plages vulnérables `>=16.0.0, <=16.4.0`, corrigé en `16.4.1` ; requête `affects=next@16.4.2` vide, témoin positif `affects=next@16.4.0` → les 3 avis | avis publiés le 2026-10-22 ; vérification faite le 2026-10-22T23:35Z UTC ; ne dit rien d'avis futurs |
| TypeScript 5.9.x | ✅ `5.9.3` (= version du jumeau C0) | `raw/npm_ls.txt`, `raw/typecheck.txt` | aucun motif écrit n'impose 7.x |
| React / react-dom / @types | ✅ `19.3.0` inchangés, épinglés | `raw/npm_ls.txt` ; peer Next 16.4.2 `^19.0.0` ; `affects=react@19.3.0`, `react-dom@19.3.0` vides | 19.3.1 existe (2026-10-14) ; non retenu : aucun avis, changement minimal |
| `npm audit` | ✅ 0 (info 0, low 0, moderate 0, high 0, critical 0) | `raw/npm_audit.json`, `raw/npm_audit.txt` | base d'avis npm à la date du run |
| `npm ci` strict | ✅ exit 0 | `raw/npm_ci.txt` ; lockfile régénéré : seuls `next`, `@next/*` (16.4.0→16.4.2) et `typescript` (7.0.2→5.9.3, 20 binaires natifs `@typescript/*` retirés) changent | — |
| `npm run build` sans secret | ✅ exit 0 | `raw/build.txt` : `env -i`, variables transmises `PATH HOME NEXT_TELEMETRY_DISABLED`, 0 fichier `.env*` | — |
| `npm run typecheck` | ✅ exit 0 | `raw/typecheck.txt` | ne couvre pas `c0/` (hors `include` du tsconfig racine ; compilé par `c0:build`) |
| Tests HTTP spike, port 3321 | ✅ 66/66 PASS, 0 FAIL | `raw/http_tests_default_3321.txt`, `raw/start_3321.txt`, `raw/server_pid.txt` (PID 82252 lancé puis `kill` ; port libre après) | seule différence avec `spike/logs/http-tests-default.log` : les identifiants aléatoires de reçu `SIM-DEV-…` (S07), `raw/http_tests_diff_vs_spike.txt` ; PHASE=promo/before non rejouées (non demandées) |
| Gel Factory vérifié | ✅ D1 validée par l'orchestrateur | `raw/factory_freeze_check.txt` | le contrôle littéral du mandat n'est pas vide (lignes de statut, `a059ec5`) ; code identique |
| `c0:sync` depuis `7a5ac012`, gel `b88f5cdf` | ✅ 452 fichiers | `raw/c0_sync_7a5ac012.txt`, `raw/c0_independent_archive_diff.txt` (archive brute `7a5ac012` ≡ `c0/` vendu, `diff -r` exit 0 ; trees `c0/{fixtures,python,ts/src,ts/test}` identiques aux deux SHA), `raw/c0_sync_idempotence.txt` (re-sync → manifeste identique). Premier sync `b88f5cdf` : `raw/c0_sync.txt` | seul `c0/README.md` diffère entre les deux vendorings (ligne de statut) |
| Refus `C0_FROZEN_CODE_MISMATCH` / `C0_SYNC_FAILED` | ✅ exit 1, rien écrit | `raw/c0_sync_refusals.txt` : `--sha 9f5d4a0e` (commit Factory réel « R-13 », `c0/fixtures`, `c0/python`, `c0/ts/src` divergents → 3 lignes de trees), SHA inconnu et dépôt invalide → `C0_SYNC_FAILED <raison>` sans trace de pile ; `git status c0` vide | remplace la preuve dégénérée `84a49dcb` (F-07) |
| `C0_SOURCE.json` | ✅ `frozen_code_sha = b88f5cdf2ca64eca8de4d19c077262e11f9e7e54`, `archived_from_sha = 7a5ac0120d808c2f08d3be7d6f935eb8388afba8`, `frozen_code_identity` (4 trees), `tree_digest = b73f1968…509c5d` | `c0/C0_SOURCE.json` | — |
| `npm run c0:check` | ✅ `C0_VENDOR_OK sha=b88f5cdf… files=452` (avant/après `c0:build`, après re-sync) ; échoue si `frozen_code_identity` manque (constaté sur l'ancien manifeste) | `raw/c0_check.txt` | `.DS_Store` ou tout fichier ajouté sous `c0/` = drift (voulu) |
| `npm run c0:build` / `c0:test` | ✅ exit 0 / **9/9** | `raw/c0_build.txt`, `raw/c0_test.txt` | — |
| `tests/c0/vendor.test.mjs` | ✅ **6/6** | `raw/vendor_test.txt` | (a) OK ; (b) octet modifié, fichier ajouté, `dist/` et `node_modules/` imbriqués, fichier supprimé, chacun avec témoin ; (c) valeurs épinglées (`frozen_code_sha`, `archived_from_sha`, `file_count`, `tree_digest`, 4 trees) ; (d) dépôt Git temporaire : code changé ou `tsconfig.json` seul changé → `C0_FROZEN_CODE_MISMATCH`, rien écrit ; docs seules → accepté ; (e) manifeste forgé cohérent : passe `check.mjs` (limite documentée) mais rejeté par les valeurs épinglées ; (f) SHA inconnu / dépôt invalide → `C0_SYNC_FAILED` sans trace |
| Parité registre `verdicts.ts.json` | ✅ octet pour octet | `raw/verdicts_parity.txt` : SHA-256 Commerce = Factory = `5abb6b69775bb73151f544e54e68d672729f00813e8a7400b1ad59334501dc90` (66 204 octets, 0 chemin absolu) ; Factory régénéré au premier passage (code Factory inchangé depuis) : `raw/factory_c0_build_test.txt` (9/9, `git status` Factory identique avant/après, `dist/` ignoré `.gitignore:31`) | parité TS↔TS ; la parité Python↔TS (`compare_verdicts.py`) n'a pas été rejouée (hors mandat) |
| Non-régression `agent-ops:test` | ✅ 15/15 | `raw/agent_ops_test.txt` (en-tête SHA `fdbfe6a3`) | — |
| Lockfile cohérent | ✅ | `raw/npm_lock_only.txt` (`npm install --package-lock-only` → diff vide) | — |
| Node 20 | ⏸️ non supporté | `engines.node >=22` (F-06) | les globs de `node --test` exigent Node ≥ 21 |

## Fichiers modifiés (7 commits de code)

- `25e38bbe` deps : `package.json` (next 16.4.2, typescript 5.9.3), `package-lock.json`.
- `5eb49ba8` outillage : `scripts/c0/{lib,sync,check}.mjs`, `tests/c0/vendor.test.mjs`, `docs/C0_VENDORING.md`,
  `package.json` (scripts `c0:sync`, `c0:check`, `c0:build`, `c0:test`, `c0:vendor-test`), `.gitignore`
  (`/c0/ts/dist/`, `/c0/ts/node_modules/`, `/.c0-sync-*/`).
- `e8782bd1` `c0/` : 452 fichiers vendus + `c0/C0_SOURCE.json`, sortie brute de `c0:sync`.
- `48aca49b` identité du code gelé : `scripts/c0/{lib,sync,check}.mjs` (`FROZEN_CODE_PATHS`, `C0_FROZEN_CODE_MISMATCH`,
  `frozen_code_identity`, option `--dest`), `tests/c0/vendor.test.mjs` (cas d), `docs/C0_VENDORING.md`.
- `156bc548` re-vendoring : `c0/README.md` (ligne de statut `C0_FROZEN`), `c0/C0_SOURCE.json`.
- `104474f7` correctifs de review : `scripts/c0/{lib,sync}.mjs`, `tests/c0/vendor.test.mjs`, `package.json` (`engines.node >=22`),
  `docs/C0_VENDORING.md`.
- `fdbfe6a3` `package-lock.json` : une ligne (`engines.node >=22` de la racine), conséquence mécanique de F-06 —
  **hors de la liste de fichiers autorisée pour les correctifs** ; aucune dépendance ni intégrité modifiée.
- Aucun changement dans `app/`, `components/`, `lib/`, `fixtures/provisional-v0/`, `next.config.ts`, `tsconfig.json`.

## Décisions prises (réversibles)

- **D1 — contrôle de gel.** `git diff --stat b88f5cdf b5c3623 -- c0/python c0/ts/src c0/ts/test c0/fixtures docs/contracts`
  n'est **pas vide** : `c0_site_v1.md` et `c0_public_identity_v1.md` (lignes de statut `NOT_FROZEN` → `C0_FROZEN`,
  commit de gel `a059ec5`) et `matching_v1.md` (ajouts `3db3c74`, `bc731c8`, hors C0). Le même contrôle restreint au
  code (`c0/python c0/ts/src c0/ts/test c0/fixtures`) est vide, ainsi que HEAD Factory (`b831750`, a avancé de 2
  commits `evidence/` pendant le lot) vs `b88f5cdf` sur `c0/`. J'ai jugé que ce n'est pas un drift du code gelé et
  **n'ai pas stoppé**. **Validée par l'orchestrateur.**
- **D2 — périmètre de l'archive.** En plus de `c0/ts/src`, `c0/ts/test`, `c0/fixtures`, `c0/README.md`, j'archive
  `c0/ts/package.json`, `c0/ts/tsconfig.json`, `c0/ts/package-lock.json` (mandat §2.3 : « réutilisés tels quels ») :
  sans eux, il faudrait écrire à la main une config de compilation dans `c0/` ; `c0/ts/package.json` fixe aussi le
  type de module (CommonJS) du JS compilé. `archive_paths` est consigné dans le manifeste.
- **D3 — `c0:build`/`c0:test` depuis la racine** avec le TypeScript 5.9.3 racine (`tsc -p c0/ts/tsconfig.json`,
  `node --test c0/ts/dist/test/*.test.js`) : pas de `npm ci` dans `c0/ts`. `c0:build` vide d'abord `c0/ts/dist`.
- **D4 — robustesse de `sync.mjs`.** Chaque fichier extrait est comparé à son blob git (`git ls-tree`), seuls les
  fichiers `100644` sont acceptés, la zone de transit est dans le dépôt (renommage atomique), `--frozen-sha`
  optionnel (défaut = `--sha`).
- **D5 — React 19.3.0 conservé** (pas de montée vers 19.3.1).
- **D6 — serveur HTTP** lancé par `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3321` (même binaire
  que `npx next start`) pour que le PID tenu soit celui du serveur ; arrêté par `kill <PID>`.
- **D7 — attribution des commits** : `Co-Authored-By: Claude Opus 5.5` (modèle réellement utilisé) au lieu de
  « Claude Fable 5.1 » écrit dans `COMMON.md` ; **validée par l'orchestrateur**. Les 7 commits du lot portent la ligne
  `Claude-Session`.
- **D8 — re-vendoring (arbitrage orchestrateur)** : archive depuis `7a5ac012` (tête PR #29), gel `b88f5cdf` ;
  identité vérifiée par objets tree git (mêmes octets et modes) sur `c0/python`, `c0/ts/src`, `c0/ts/test`, `c0/fixtures`.
  Les fichiers de config `c0/ts/{package.json,tsconfig.json,package-lock.json}` sont hors du contrôle d'identité
  (archivés, couverts par le manifeste ; inchangés entre les deux SHA).

## Correctifs de la review indépendante (`REVIEW_PASS` à `918e5437`)

| Finding | Correction | Preuve |
|---|---|---|
| F-01 `dist`/`node_modules` exclus à toute profondeur | exclusion limitée aux chemins exacts `c0/ts/dist`, `c0/ts/node_modules` | test (b) `nested_dist`, `nested_node_modules` → `ADDED` |
| F-02 manifeste forgé cohérent accepté | valeurs du manifeste épinglées dans `vendor.test.mjs` ; limite de `check.mjs` documentée | tests (c), (e) |
| F-03 trace de pile sur SHA inconnu / dépôt invalide | `C0_SYNC_FAILED <raison>`, exit 1 (aussi `ls-tree`, `archive`, `tar`) | test (f), `raw/c0_sync_refusals.txt` |
| F-04 configuration vendue hors du contrôle de gel | blobs `c0/ts/{package.json,tsconfig.json,package-lock.json}` exigés identiques ; non consignés pour garder les octets du manifeste v1 (re-sync → manifeste identique, `raw/c0_sync_idempotence.txt`) | test (d), cas `tsconfig.json` seul |
| F-06 `engines` | `>=22` (package.json + ligne racine du lockfile) | `raw/npm_lock_only.txt` |
| F-07 preuves | PID corrigé (82252, rejeu final) ; en-têtes SHA/date sur `advisories_gh_api.txt`, `npm_view_versions.txt`, `agent_ops_test.txt` ; refus rejoué sur `9f5d4a0e` | `raw/` |
| F-08 (note) remplacement non atomique | l'ancien `c0/` est mis de côté dans la zone de transit avant de poser le nouveau | lecture de `sync.mjs` |
| F-05, F-09, F-10, F-11, F-12 (notes) | non traitées : parité de registre non épinglée dans un test (A2/intégration), `c0:check` non câblé en CI, `--frozen-sha` à rendre obligatoire en v2 | — |

## Tests non exécutés

PHASE `promo` / `before` des tests HTTP, captures Chrome, `compare_verdicts.py` (Python↔TS), suite Django Factory
(lot sans code Factory), tests sur Windows/Linux, comportement sous charge.

## Dettes découvertes (candidates NON-OUBLI, non clôturées)

- ~~README vendu `NOT_FROZEN`~~ : corrigé par le re-vendoring depuis `7a5ac012` (`156bc548`).
- **Candidate NON-OUBLI (Factory)** : `c0/README.md` de Factory, section « Utiliser depuis BC2–BC5 », conseille
  « copier ou référencer `c0/ts/src` », ce qui contredit le mécanisme imposé (vendoring épinglé au SHA par
  `git archive`, manifeste, anti-drift). À aligner côté Factory (portée par l'orchestrateur au NON-OUBLI).
- DF-0091 : dette dépendances fermée côté versions ; surface résiduelle du spike inchangée (routes POST sans limite
  de débit, Map d'idempotence non bornée) — hors mandat.

## Questions `REQUIRES_OWNER_DECISION` / orchestrateur

Aucune ouverte : D1, le README vendu et l'attribution ont été arbitrés par l'orchestrateur (voir D1, D7, D8).
