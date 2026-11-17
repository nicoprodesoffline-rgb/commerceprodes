# PRODES Commerce — SITE D sur le contrat C0 gelé (W1/A2)

Site de vente PRODES (programme PRODES Data Factory V5.1). **Non déployable seul, non destiné à `main` en l'état** : le déploiement du tampon se décide par la Factory.

- Next.js 16.4.5, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3 — `npm ci` strict.
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

## Régler un serveur neuf (cercle 4)

Tout se règle à partir de **`.env.example`** (complet, commenté, sans valeur réelle ; un test compare sa liste aux variables lues par le code : `tests/nav/env-example.test.mjs`).

- **Un seul processus de site** sur le serveur (une seule instance du service). Réglages, redirections et adresses d'images sont gardés en mémoire tant qu'aucune publication n'est arrivée dans CE processus
  (`lib/site-db/epoch.ts`) ; un second processus ne verrait une publication qu'au bout de `SITE_MEMORY_MAX_AGE_SECONDS` (30 s).
- **Frontal** (Caddy) : il pose l'adresse du visiteur dans `X-Forwarded-For` ; `SITE_TRUSTED_PROXY_HOPS=1` dit qu'un frontal est devant et que l'adresse retenue est la dernière valeur. Sans ce réglage, l'en-tête
  est ignoré. Il sert aussi la page `ops/maintenance.html` (code 503, `Retry-After`) quand le site est arrêté pour une mise à jour.
- **Santé** : `GET /api/site/health` répond `{"status":"ok"}` (200) ou 503 si la base est arrêtée. Le détail (commit servi, base, disque, dernière sauvegarde) est dans `lib/site-health/details.ts`, rendu par la sonde signée.
- **Routes de la Factory** (`/api/site/publish/**`, `/content/**`, `/events/**`) : au-delà de `SITE_MACHINE_FAILURE_LIMIT` refus de signature par minute et par adresse, 429 ; une requête bien signée n'est jamais limitée ; liste d'adresses autorisées facultative.
- **Images** : `/media/<empreinte>` répond en flux avec `ETag` et `Cache-Control: public, max-age=31536000, immutable` ; cache mémoire borné (`SITE_MEDIA_CACHE_MB`, 256 Mo, plus ancien évincé d'abord).
- **Demande en ligne** : `SITE_BUSINESS_PERSISTENCE=closed` — les pages devis et commande disent que la demande en ligne n'est pas ouverte, rien n'est enregistré.
