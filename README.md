# PRODES Commerce — SITE D sur le contrat C0 gelé (W1/A2)

Branche `build/w1-a2-app-on-c0` (macro-wave W1+W2, programme PRODES Data Factory V5.1), issue de
`build/site-d-foundation` (spike BC1-D). **Non déployable, non destinée à `main` en l'état.**

- Next.js 16.4.2, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3 — `npm ci` strict.
- Contrat : C0 v1 gelé, **vendu** dans `c0/` (ne jamais l'éditer ; `npm run c0:check`, voir `docs/C0_VENDORING.md`).
- Catalogue : source unique `lib/site-catalog/source.ts`, choisie par `SITE_CATALOG_SOURCE` (obligatoire) :
  - `fixture` : `FixtureSource`, document `site_snapshot.v1` gelé nommé par
    `SITE_CATALOG_FIXTURE=<SCÉNARIO>/<fichier>.json` (sous `c0/fixtures/documents/`), médias de `c0/fixtures/media/` ;
  - `db` : `ActiveGenerationSource` de BC2 (pas encore fournie : erreur explicite).
- Prix : uniquement `selectPrice` C0, côté serveur. Devis / commande : verdict C0 sur les octets bruts,
  **rien n'est enregistré** (`persistence: NONE_UNTIL_BC4`) — `lib/site-business/validate.ts`.
- Instant : `SITE_NOW_UTC` (format C0 `YYYY-MM-DDTHH:MM:SSZ`, tests et démonstrations) ; absent = horloge serveur.

```sh
npm ci
npm run build
SITE_CATALOG_SOURCE=fixture SITE_CATALOG_FIXTURE=F_SELL_WINDOWS/snapshot_s7.json \
  SITE_NOW_UTC=2026-10-20T09:00:00Z npx next start -H 127.0.0.1 -p 3311
npm run test:http   # lance et arrête lui-même ses serveurs sur le port 3341
```

Rapports : `evidence/W1/A2/REPORT.md`, historique du spike `spike/BC1_D_REPORT.md`. Règles : `AGENTS.md`, `CLAUDE.md`.
