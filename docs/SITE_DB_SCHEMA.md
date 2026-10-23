# Base SITE — schéma et interface de lecture (BC2, W1)

Statut : `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL` (PostgreSQL 18.6 local du Mac, port 54318). Jamais JARVIS,
jamais une base Factory. Propriétaire : BC2 (receiver de publication). Lecteurs : BC3 (façade), BC4 (devis/commandes).

## Environnement local

| Élément | Valeur |
|---|---|
| Rôle | `prodes_site`, mot de passe `local-dev-only` — identifiant de **TEST** local, pas un secret |
| Bases | `prodes_site_bc2` (dev), `prodes_site_bc2_test` (tests, remise à zéro par chaque fichier de test) |
| Création | `scripts/db/create-local.sh [--recreate] <prodes_site_…> …` (idempotent, refuse tout nom hors `prodes_site_*`, refuse un hôte non local) |
| Migrations | `SITE_DATABASE_URL=… node scripts/db/migrate.mjs` (`npm run db:migrate`) |
| Connexion | **uniquement** `SITE_DATABASE_URL` (ex. `postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc2`) ; aucune valeur par défaut ; refus `SITE_DB_CONFIG_INVALID` si la base n'est pas `prodes_site*`, si l'hôte n'est pas `localhost`/`127.0.0.1`/`::1` (sauf `SITE_ALLOW_REMOTE_DB=1` explicite), si l'hôte est `jarvis…` (toujours), ou si l'URL porte un paramètre `host`, `hostaddr`, `options`, `dbname`, `database`, `service`, `servicefile` (review F-04 ; même garde dans `scripts/db/migrate.mjs`) |
| Pilote | `pg` 8.23.1 épinglé (`@types/pg` 8.23.1) |

## Migrations

- Fichiers SQL bruts `db/migrations/NNN_<nom>.sql`, appliqués dans l'ordre, **chacun dans sa transaction**, sous verrou
  consultatif ; table `schema_migrations(version, name, sha256, applied_at)`.
- Idempotent : une migration appliquée est sautée si son SHA-256 est inchangé ; modifiée → `MIGRATION_DRIFT` (échec).
  On n'édite jamais une migration appliquée : on en ajoute une.
- **Plages réservées : BC2 = `001`–`009` ; BC4 = `010`–`019`.** BC2 a livré `001`–`005`.

| Migration | Objet |
|---|---|
| `001_site_generation.sql` | générations reçues |
| `002_site_active_pointer.sql` | pointeur ACTIVE (ligne unique) |
| `003_site_media.sql` | médias adressés par contenu |
| `004_site_publication_log.sql` | journal append-only |
| `005_site_generation_immutable.sql` | déclencheur `BEFORE UPDATE` : `snapshot_bytes`, `snapshot_json`, `transport_json`, `payload_sha256`, séquence, `publication_id`, `projection_id`, `scope_key` immuables ; un ACK posé (`ack_bytes`/`ack_json`) ne change plus (review F-02) |

## Tables

### `site_generation`

Une ligne par `(catalogue_sequence, payload_sha256)` reçue et passée au STAGE (étapes C0 1–7).

| Colonne | Type | Règle |
|---|---|---|
| `id` | `bigserial` PK | |
| `publication_id`, `projection_id`, `scope_key` | `text` | valeurs du document |
| `catalogue_sequence` | `bigint` | ≥ 1 |
| `payload_sha256` | `char(64)` | hex minuscule |
| `snapshot_bytes` | `bytea NOT NULL` | **octets canoniques reçus = vérité** ; jamais journalisés |
| `snapshot_json` | `jsonb NOT NULL` | vue requêtable seulement (jsonb ne conserve pas les octets) |
| `transport_json` | `jsonb NOT NULL` | en-têtes `{key_id, signature}` du STAGE (aucun secret) |
| `status` | `text` | `STAGED` · `VERIFIED` · `ACTIVE` · `SUPERSEDED` · `REJECTED` · `HOLD` |
| `last_result` | `jsonb` | dernier résultat C0 `{operation, at_utc, accepted, outcome, error_codes, stage, detail}` (sans ACK) |
| `staged_at`, `verified_at`, `activated_at` | `timestamptz` | horloge serveur du SITE |
| `ack_json` | `jsonb` | ACK signé (vue) |
| `ack_bytes` | `bytea` | **octets canoniques de l'ACK**, renvoyés tels quels en `REPLAY_ACK` |

Contraintes : `UNIQUE (catalogue_sequence, payload_sha256)` ; index unique partiel `WHERE status = 'ACTIVE'` (au plus
une génération ACTIVE) ; une ligne `ACTIVE`/`SUPERSEDED` porte `ack_json`, `ack_bytes` et `activated_at` ;
`ack_json` et `ack_bytes` sont présents ensemble.

Transitions (toutes décidées par `evaluatePublication`, jamais par une règle locale) :

```text
STAGE ok ────────────► STAGED ──VERIFY_MEDIA ok──► VERIFIED
STAGED/VERIFIED/HOLD/REJECTED ──ACTIVATE──► ACTIVE        (ACTIVATED ; l'ancienne ACTIVE -> SUPERSEDED)
                                         ├─► HOLD          (STAGE_HOLD ; ancienne génération servie)
                                         ├─► REJECTED      (séquence, identité, couverture, sûreté, environnement)
                                         └─► STAGED        (MEDIA_* : VERIFIED redevient STAGED)
ACTIVE / SUPERSEDED : jamais modifiées par un refus (aucun re-pointage vers une ancienne génération).
Refus de signature : aucun changement d'état.
```

### `site_active_pointer`

Une **seule** ligne (`singleton = 1`, insérée par la migration, suppression et `TRUNCATE` refusés par déclencheur).

| Colonne | Type |
|---|---|
| `singleton` | `smallint` PK, `CHECK (singleton = 1)` |
| `generation_id` | `bigint REFERENCES site_generation` |
| `catalogue_sequence`, `payload_sha256`, `activated_at` | copie de la génération pointée |

Tout est `NULL` avant la première activation, ou tout est renseigné. **Chaque ACTIVATE prend `SELECT … FOR UPDATE`
sur cette ligne** puis relit l'ACTIVE dans le verrou ; deux activations concurrentes sont donc sérialisées.

### `site_media`

| Colonne | Type | Règle |
|---|---|---|
| `sha256` | `char(64)` PK | = SHA-256 des octets (adressage par contenu) |
| `mime` | `text` | `Content-Type` du PUT s'il est PNG/JPEG/WebP, sinon `NULL` ; **indicatif, jamais utilisé pour décider** (le `mime` déclaré par `media_refs` fait foi) |
| `size` | `integer` | 1 … 20 971 520, `= octet_length(bytes)` |
| `bytes` | `bytea NOT NULL` | octets publics |
| `received_at` | `timestamptz` | |

### `site_publication_log`

Append-only (`UPDATE`, `DELETE`, `TRUNCATE` refusés par déclencheurs). **Sans PII, sans secret, sans octets** (ni
snapshot, ni média, ni signature).

| Colonne | Contenu |
|---|---|
| `id`, `at` | séquence, `clock_timestamp()` |
| `operation` | `STAGE`, `MEDIA_PUT`, `VERIFY_MEDIA`, `ACTIVATE`, `ACTIVATE_ABORTED` (`STATUS` réservé, non écrit) |
| `publication_id`, `catalogue_sequence`, `payload_sha256` | corrélation (valeurs au format C0 seulement, sinon `NULL`) |
| `outcome` | `STAGED`, `STAGED_IDEMPOTENT`, `MEDIA_VERIFIED`, `ACTIVATED`, `REPLAY_ACK`, `REJECTED`, `STAGE_HOLD`, `STORED`, `ALREADY_STORED`, `REPAIRED`, `TRANSPORT_ERROR`, `ROLLED_BACK` |
| `error_codes` | codes C0 triés |
| `stage` | étape d'arrêt C0 (ou `environment`) |
| `detail` | clés bornées : `rules`, `hold_reason`, `key_id`, `transport_error`, `media_sha256`, `size`, `generation_status`, `superseded_sequence`, `second_effect`, `reason` (code d'erreur PostgreSQL d'un abandon) |

## Interface `lib/site-db` (pour BC3/BC4)

```ts
import { getPool, createPool, withTransaction, siteDatabaseName, SiteDbConfigError, type Queryable } from "@/lib/site-db/pool";
import { getActiveGeneration, readActiveForUpdate, type ActiveGeneration } from "@/lib/site-db/generation";

interface ActiveGeneration {
  generation_id: number;
  catalogue_sequence: number;
  payload_sha256: string;
  snapshot: Snapshot | null;     // type C0 (c0/ts/src/snapshot.ts), relu depuis snapshot_bytes ; null si UNSAFE
  status: "ACTIVE" | "UNSAFE";
}
getActiveGeneration(client?: Queryable): Promise<ActiveGeneration | null>   // sans verrou ; pool partagé par défaut
readActiveForUpdate(client: PoolClient): Promise<ActiveGeneration | null>    // DANS une transaction ouverte, FOR SHARE
```

- `null` = aucune génération n'a jamais été activée.
- **Aucun cache** : chaque appel relit la base (le pool ne garde que des connexions).
- `readActiveForUpdate` prend un verrou **partagé** (`FOR SHARE OF site_active_pointer`) : tant que la transaction
  appelante (BC4 : devis/commande) n'a pas fini, aucune activation (`FOR UPDATE`) ne peut basculer la génération ;
  plusieurs transactions BC4 peuvent le tenir en même temps. L'appelant doit avoir fait `BEGIN` (ex. `withTransaction`).
  Une activation en attente du verrou bloque aussi les nouveaux `FOR SHARE` : BC4 doit garder ses transactions courtes.
- `status: "UNSAFE"` est **fail-closed** : pointeur et ligne discordants (séquence, SHA, statut ≠ `ACTIVE`), octets
  illisibles, non canoniques, ou `payload_sha256` recalculé ≠ stocké. Le passer tel quel à `site_business` C0
  (`{snapshot, status}`) donne `CATALOG_UNSAFE`. **Quand `status` vaut `UNSAFE`, `snapshot` vaut `null`** (F-05) :
  BC3/BC4 ne lisent jamais un document non vérifié. **Il n'existe en W1 aucun marquage opérationnel « UNSAFE »** d'une
  génération saine (décision/outillage hors périmètre BC2).
- Le receiver applique le **même contrôle** à l'ACTIVE qu'il relit (STAGE, VERIFY_MEDIA, ACTIVATE) : ACTIVE `UNSAFE`
  → refus `CATALOG_UNSAFE`, aucune activation par-dessus (F-02). Reprise : rétablir les octets d'origine (geste DBA,
  hors receiver) ; aucune voie HTTP ne contourne ce refus.
- **`UNSAFE` ne couvre pas les médias** de l'ACTIVE (F-06, dette) : un octet de `site_media` altéré après activation
  laisse `status: "ACTIVE"`. BC3 (route `/media/[sha256]`) doit revérifier le SHA-256 des octets à la lecture.
- `getPool()` lit `SITE_DATABASE_URL` à la première demande (singleton de processus) ; `createPool(url)` pour un pool
  dédié (tests, outils), fermé par l'appelant.

## Ce que ce schéma ne prouve pas

Immutabilité face au rôle propriétaire : `prodes_site` possède les tables et peut désactiver les déclencheurs
(`ALTER TABLE … DISABLE TRIGGER`) ; append-only et immutabilité ne valent que contre le receiver et les rôles non
propriétaires (dette F-09, droits fins avant toute base partagée). Volumétrie réelle (FULL 2–3 k Items, `snapshot_bytes` jusqu'à 32 MiB par ligne), rétention/purge des générations et
médias, sauvegarde, réplication, PostgreSQL hors Mac, droits fins (le rôle de test possède les bases), comportement
sous charge prolongée.
