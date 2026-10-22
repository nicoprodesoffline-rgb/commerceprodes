# PRODES Commerce — spike BC1-D (coque Next.js stable propre)

Branche de spike `spike/bc1-d-clean-shell` (Wave 0, programme PRODES Data Factory V5.1).
**Non déployable, non destinée à `main`.** L'ancien code (`app/`, `components/`, `lib/`
au HEAD `a985aca2`) a été retiré par `git rm` (historique conservé) ; seuls quelques
composants graphiques ont été transplantés (voir `spike/FILE_MATRIX.md`).

- Next.js 16.4.0, React 19.3.0, TypeScript 7.0.2, Tailwind 4.3.3 — `npm ci` strict.
- Données : fixture **provisoire** `fixtures/provisional-v0/` (STAGING_FIXTURE), lue
  uniquement par `lib/site-dto/index.ts`. Aucun Supabase, aucun Shopify.
- Devis / commande : simulateur (`/api/site/quote`, `/api/site/order`) — **rien n'est
  enregistré** (`persistence: NONE_CONTRACTUAL_SIMULATION`).
- Instant de référence : variable `SPIKE_NOW_UTC` (défaut `2026-10-22T20:00:00Z`).

```sh
npm ci
npm run build
SPIKE_NOW_UTC=2026-10-22T20:00:00Z npx next start -H 127.0.0.1 -p 3311
PHASE=default BASE_URL=http://127.0.0.1:3311 node spike/http-tests.mjs
```

Rapport : `spike/BC1_D_REPORT.md`. Règles du dépôt : `AGENTS.md`, `CLAUDE.md`.
