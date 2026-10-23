# W1 / I1 — miroir SITE (rapport complet côté Factory)

Rapport complet et preuves brutes : Factory `build/w1-candidate@1ba508a`, `evidence/W1/I1/REPORT.md` et `evidence/W1/I1/raw/`.

**Verdict : `I1_FAIL`** — cause bloquante unique D-02 (ci-dessous). Statut maximal `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`.

## SHA
- SITE code testé : **`9ab72c3c`** = `003a7be6` (= `aa4c9812` + reviews) + `git merge --no-ff b13a01e3` (A1 absent de l'assemblage :
  `git merge-base --is-ancestor b13a01e3 aa4c9812` → faux ; fusion sans conflit, GO orchestrateur).
- Factory code testé : `12bc9ee` (preuves `1ba508a`).
- C0 : `C0_VENDOR_OK sha=b88f5cdf… files=452 tree_digest=b73f1968…` avant/après `c0:build` ; `git diff 156bc548 -- c0/` vide.

## Chiffres au SHA `9ab72c3c` (état propre, base `prodes_site_i1_test`, port 3372)
| Suite | Résultat |
|---|---|
| `npm ci`, build `env -i`, `typecheck` | exit 0 |
| `c0:test` / `c0:vendor-test` / `agent-ops:test` | 9/9 / 6/6 / 15/15 |
| `test:bc2` (commande sous-jacente, base I1) | 58/58 |
| `test:bc4` | 73/73 |
| `test:http` (A2) | 88/88 |
| `test:bc4:http` | 7/7 |
| `test:storefront` | 16/16 |
| recette UI Playwright BC3 | 9/9 |
| `tests/bc2/http-smoke.mjs` (serveur réel 3371) | 16/16 |
| **`tests/bc2/http-body-limits.mjs`** (serveur réel 3371) | **7/22 (15 FAIL)** — 22/22 au lot BC2 |
| tests HTTP du spike (66) | NOT_RUN (`spike/http-tests.mjs` supprimé par A2 `51704a3e`) |

## Défauts SITE
- **D-02 (bloquant pour I1_PASS, BC3 × BC2)** : `proxy.ts` (matcher = toutes routes sauf `_next`/favicon) couvre `/api/site/publish/*` ;
  Next 16 tronque alors le corps à 10 MiB (`proxyClientMaxBodySize`). Média légitime 10–20 MiB → 401 `SIGNATURE_INVALID` ; snapshot
  légitime 10–32 MiB → 400 `PAYLOAD_MALFORMED` ; flux 100 MiB → 400 au lieu de 413, refus journalisés. Diagnostic : matcher excluant
  `api/site/publish` → `http-body-limits` 22/22 et médias 15/20 MiB → 201 (copie jetable, non committée).
- D-03 (mineur, BC3) : fiche, ~100–300 ms après changement de quantité, prix/total de la quantité précédente affichés avec la nouvelle.
- D-04 (mineur, BC2) : `npm run test:bc2` code en dur `prodes_site_bc2_test`.
