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
- **Plages réservées : BC2 = `001`–`009` ; BC4 = `010`–`019`.** BC2 a livré `001`–`005` ; BC4 a livré `010`–`015`
  (section « BC4 — transactions » ci-dessous).

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
- `withTransaction(pool, fn)` : `BEGIN` … `COMMIT`, `ROLLBACK` sur exception ; une connexion coupée pendant la
  transaction (redémarrage PostgreSQL, `pg_terminate_backend`) **rejette la promesse** sans exception non capturée
  (écouteur `error` sur le client emprunté, client détruit au lieu d'être rendu au pool) ; le processus et le pool
  continuent (test `tests/bc2/17_connection_loss.test.mjs`). L'ACTIVATE du receiver applique la même règle.
- `getPool()` lit `SITE_DATABASE_URL` à la première demande (singleton de processus) ; `createPool(url)` pour un pool
  dédié (tests, outils), fermé par l'appelant.

## Ce que ce schéma ne prouve pas

Immutabilité face au rôle propriétaire : `prodes_site` possède les tables et peut désactiver les déclencheurs
(`ALTER TABLE … DISABLE TRIGGER`) ; append-only et immutabilité ne valent que contre le receiver et les rôles non
propriétaires (dette F-09, droits fins avant toute base partagée). Volumétrie réelle (FULL 2–3 k Items, `snapshot_bytes` jusqu'à 32 MiB par ligne), rétention/purge des générations et
médias, sauvegarde, réplication, PostgreSQL hors Mac, droits fins (le rôle de test possède les bases), comportement
sous charge prolongée.

---

# BC4 — transactions SITE : devis, commandes, idempotence, outbox (W1)

Statut : `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`. Propriétaire : BC4. Lecture de la génération ACTIVE **uniquement** par
`lib/site-db` (BC2) ; aucune table ni migration BC2 modifiée. Bases BC4 : `prodes_site_bc4` (dev),
`prodes_site_bc4_test` (tests, remise à zéro par chaque fichier). Décisions : **uniquement** le C0 vendu
(`validateQuoteRequest`, `validateOrderSubmit`, `selectPrice`, `lookupReceipt`, `validateEvent`, `validatePollRequest`,
`payloadDigest`, `canonicalBytes`, `signing.*`).

| Migration | Objet |
|---|---|
| `010_site_idempotency.sql` | registre d'idempotence durable + fonction `site_bc4_immutable()` |
| `011_site_quote.sql` | `site_quote_request`, `site_quote_line` |
| `012_site_order.sql` | `site_order`, `site_order_line` |
| `013_site_outbox_event.sql` | outbox `site_events.v1` |
| `014_site_event_cursor.sql` | curseurs de poll émis par le SITE |
| `015_site_transaction_log.sql` | journal append-only BC4 |

**Aucune colonne** taxe, TVA/TTC, port, statut client, paiement, facture (vérifié par `tests/bc4/09`). Aucun type
flottant ni `numeric` : montants = chaîne Money C0 (`^(0|[1-9][0-9]{0,8})\.[0-9]{2}$`) **et** centimes `bigint`, liés par
`CHECK (cents = replace(montant, '.', '')::bigint)`.

### `site_idempotency`

| Colonne | Type | Règle |
|---|---|---|
| `kind` | `text` | `quote_request` · `order` |
| `idempotency_key` | `text` | format C0 §6 |
| `request_fingerprint` | `char(64)` | `requestFingerprint` C0 (lignes triées, sans la clé) |
| `receipt_ref` | `text UNIQUE` | `ORD-<32 hex>` / `QR-<32 hex>` (128 bits aléatoires, non prévisible) |
| `receipt_json` | `jsonb` | reçu renvoyé au client (lignes C0 + `receipt_ref` + `created_at_utc`), **sans contact ni jeton** |
| `created_at` | `timestamptz` | |

`PRIMARY KEY (kind, idempotency_key)` : c'est **l'unicité en base** qui tranche deux POST concurrents (CE-T03). Immuable
(UPDATE/DELETE/TRUNCATE refusés).

### `site_quote_request` / `site_quote_line`

`site_quote_request(id, quote_ref UNIQUE, idempotency_key UNIQUE, request_fingerprint, catalogue_sequence NULL, contact jsonb,
message NULL, status = 'RECEIVED', access_token_sha256, created_at_utc, created_at)`.

`site_quote_line(id, quote_id FK, line_no 1…200, public_item_key, variant_axes jsonb, quantity 1…1 000 000, priced,
catalogue_sequence, rate_id, unit_amount, currency, tax_basis_or_status, offer_price_version_public)`, `UNIQUE (quote_id,
line_no)`, `UNIQUE (quote_id, public_item_key, variant_axes)`. `CHECK` : une ligne `priced` porte **tout** son prix, une
ligne non chiffrée **n'en porte aucun** (jamais un ancien montant reconduit). Les lignes sont celles renvoyées par
`validateQuoteRequest` ; `offer_price_version_public` (absent de la ligne de devis C0) est relu par `selectPrice` C0 sur la
même génération au même instant, avec exigence d'égalité `rate_id`/`unit_amount` (sinon `DB_WRITE_FAILED`).

### `site_order` / `site_order_line`

`site_order(id, order_ref UNIQUE, idempotency_key UNIQUE, request_fingerprint, catalogue_sequence NOT NULL, contact jsonb,
currency = 'EUR', total_amount, total_cents, status ∈ {RECEIVED, PENDING_REVIEW}, access_token_sha256, created_at_utc,
created_at)`.

`site_order_line(id, order_id FK, line_no, public_item_key, variant_axes, quantity, catalogue_sequence, rate_id, unit_amount,
unit_cents, currency, tax_basis_or_status, offer_price_version_public, line_total, line_total_cents)`, `UNIQUE (order_id,
public_item_key, variant_axes)`, `CHECK (line_total_cents = unit_cents * quantity)`. **Historique figé** : prix, `rate_id`,
version d'offre, quantité et séquence sont ceux de la sélection C0 au moment de la commande ; une activation ultérieure ne
les change pas (`tests/bc4/12`).

Gardes en base :
- contrainte **différée** `site_order_lines_consistent` (au COMMIT) : ≥ 1 ligne **et** `total_cents = Σ line_total_cents` ;
  `site_quote_request_has_lines` : ≥ 1 ligne ;
- lignes et devis immuables ; commande : seule la transition `RECEIVED → PENDING_REVIEW` est admise (aucune route W1) ;
- le code vérifie aussi ces deux invariants **avant** le COMMIT (double garde).

### `site_outbox_event`

| Colonne | Règle |
|---|---|
| `event_id` | `EVT-<32 hex>`, UNIQUE |
| `event_type`, `event_version` | `quote.requested`/`order.received`, `= 1` |
| `created_at_utc`, `object_ref`, `catalogue_sequence` | enveloppe §11.1 (`object_ref` = `receipt_ref`) |
| `idempotency_key` | `<event_type>:<object_ref>` (convention des fixtures `F_QUOTE_ORDER/event_*.json`) ; **pas** la clé client |
| `payload` (jsonb), `payload_digest` | vue requêtable ; `payload_digest = payloadDigest(payload)` |
| `event_bytes` (bytea) | **octets canoniques exacts** (`canonicalBytes(event)`) servis tels quels au poll ; contrôlés `validateEvent(bytes, []) = APPLY` avant INSERT |
| `status` | `PENDING` → `DELIVERED_TO_POLL` → `ACKED` (monotone, `ACKED` final) |
| `delivery_count`, `delivered_at`, `acked_at` | suivi de livraison |

`UNIQUE (event_type, idempotency_key)`, `UNIQUE (event_type, object_ref)`. Contenu immuable (seuls statut et suivi évoluent).
**Aucune donnée personnelle** : le payload est construit à partir des lignes figées seulement (aucune clé de contact possible ;
`tests/bc4/09` cherche `contact`, `email`, `phone`, `message`… dans les octets).

### `site_event_cursor`

`(cursor PK = CUR-<32 hex>, credential_key_id, position, event_ids text[], issued_at)` : curseur opaque **émis** à chaque
poll, lié à la clé qui l'a reçu ; `event_ids` = événements servis sous ce curseur (ACK par curseur exact, insensible aux trous
de séquence). Immuable. Un curseur présenté par une autre clé est `CURSOR_INVALID`.

### `site_transaction_log`

Append-only : `operation` (`QUOTE`, `ORDER`, `RECEIPT`, `EVENTS_POLL`, `EVENTS_ACK`), `outcome`, `error_codes`,
`object_ref` (référence créée/trouvée seulement), `detail` (`reason` = SQLSTATE, `concurrent`, `key_id`, compteurs). **Ni
contact, ni message, ni jeton, ni clé d'idempotence client, ni signature.** Écrit **hors** transaction métier, au mieux : un
échec du journal ne change jamais la réponse.

## Transaction devis / commande (`lib/site-transactions/business.ts`)

```text
BEGIN ; SET LOCAL lock_timeout = 5s, statement_timeout = 15s
(1) readActiveForUpdate(client)        -- FOR SHARE du pointeur : aucune activation ne bascule avant notre fin
    null → 503 CATALOG_UNAVAILABLE NO_ACTIVE_GENERATION ; octets illisibles → 503 ACTIVE_GENERATION_UNREADABLE
(2) register = site_idempotency WHERE (kind, idempotency_key)
(3) verdict = validateQuoteRequest|validateOrderSubmit(octets bruts, {snapshot, status}, register, instant serveur)
    refus → ROLLBACK, code C0 (HTTP §13), 0 ligne ; REPLAY_SAME_RECEIPT → ROLLBACK, receipt_json d'origine
(4) RECEIVED : INSERT site_idempotency … ON CONFLICT DO NOTHING
      0 ligne (concurrent commité) → relecture + NOUVEAU verdict C0 avec ce registre → REPLAY ou 409, ROLLBACK
    INSERT objet ; INSERT lignes (depuis le reçu C0) ; contrôles ≥ 1 ligne et Σ centimes ; INSERT outbox
(5) COMMIT (contraintes différées)
(6) réponse 200 APRÈS le COMMIT
toute exception (connexion, SQL, COMMIT, connexion tuée) → ROLLBACK, 503 DB_WRITE_FAILED (jamais accepted:true)
```

Réponse `RECEIVED` : `{contract_version, kind, persistence:"POSTGRESQL_SITE_LOCAL", durable:true, instant_utc, accepted:true,
outcome:"RECEIVED", error_codes:[], receipt_ref, request_fingerprint, lines, receipt, access_token}`. **`access_token` n'est
renvoyé qu'à la création** (256 bits, base64url ; stocké SHA-256) ; un rejeu (`REPLAY_SAME_RECEIPT`) rend le même `receipt`
sans jeton. Refus : `{…, durable:false, accepted:false, outcome, error_codes, superseded_by, catalogue_sequence, verdict}`.
`DB_WRITE_FAILED` : `503 {…, error_codes:["DB_WRITE_FAILED"], detail:{reason:<SQLSTATE>}}` ; le client **rejoue à l'identique** :
si le COMMIT avait eu lieu, il reçoit `REPLAY_SAME_RECEIPT`.

Sélection des routes `POST /api/site/quote|order` : `SITE_BUSINESS_PERSISTENCE=postgresql` → BC4 ; absente → comportement A2
inchangé (`NONE_UNTIL_BC4`, `durable:false`) ; toute autre valeur → `503 TRANSACTIONS_CONFIG_INVALID`.

## Consultation `GET /api/site/receipt?ref=…&access_token=…`

`lookupReceipt` C0 sur `{ref, access_token}` (clé absente ≠ vide) et les enregistrements `{ref, access_token_sha256}` des deux
tables : jeton absent/vide → `401 UNAUTHORIZED` ; référence inconnue, mal formée ou jeton faux → `404 NOT_FOUND`, **octets de
réponse identiques**. `200 {outcome:"FOUND", receipt_ref, kind, status, receipt}` (sans contact, sans jeton).

## Ce que BC4 ne prouve pas

Poll réel sur 48 h, volumétrie (débit de commandes, taille de l'outbox, purge/rétention des événements ACKED et des curseurs —
un curseur est inséré à chaque poll), sauvegarde, réplication, PostgreSQL hors Mac, secrets réels, jeton d'accès en paramètre
d'URL (journaux de proxy : `DEFERRED_FOR_PROD`), route scopée d'accès aux coordonnées par la Factory (`DEFERRED_FOR_PROD`),
transition `PENDING_REVIEW` (aucune route), comportement sous charge prolongée.
