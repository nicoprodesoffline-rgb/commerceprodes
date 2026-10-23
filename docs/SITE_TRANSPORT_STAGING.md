# Transport de publication Factory → SITE — `STAGING_TRANSPORT` (BC2, consommé tel quel par BC5)

Statut : `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`. Ce transport est **hors contrat C0** : C0 v1 ne fige que les octets,
les digests et les signatures (§15 `DEFERRED_FOR_PROD` : HTTPS, en-têtes exacts, débit, anti-rejeu horodaté, transport
des médias). Tout ce qui suit est le transport de **staging local** de W1 ; il ne vaut pas transport de production.

Règles, ordre des étapes et codes d'erreur : **uniquement** C0 v1 vendu (`c0/ts/src`, Factory `b88f5cdf`). Le receiver
appelle `evaluatePublication` à chaque opération et interprète l'étape d'arrêt (`stage`).

## Configuration du receiver

| Variable | Valeur |
|---|---|
| `SITE_DATABASE_URL` | base `prodes_site*` sur hôte `localhost`/`127.0.0.1`/`::1` (voir `docs/SITE_DB_SCHEMA.md`), aucune valeur par défaut ; hôte distant seulement avec `SITE_ALLOW_REMOTE_DB=1`, `jarvis` toujours refusé |
| `SITE_ENV` | `staging` ou `production` |
| `SITE_KEYRING_PATH` | trousseau C0 ; aucune valeur par défaut. Staging/tests : `c0/fixtures/keys/test_keyring.json` (secrets `TEST_SECRET_NOT_FOR_PRODUCTION`) |
| `SITE_ACK_KEY_ID` | clé de scope `activation_ack`, statut `ACTIVE` (staging : `c0-test-ack-01`) |
| `SITE_WITHDRAWAL_HOLD_POLICY` | JSON `{"max_withdrawals_without_release": int\|null, "released_expected_withdrawals_digest": hex\|null}` ; absente ou invalide = erreur ; `null` **seulement** si `SITE_ENV=staging` (C0 §8.4, R-11 ; DF-0090 ouverte, aucun seuil calibré). `null` avec un autre `SITE_ENV` (production, absent, inconnu) **refuse le démarrage** du serveur : `[site-publish] DÉMARRAGE REFUSÉ : …`, code de sortie 1 (`instrumentation.ts` → `enforceStartupPolicy`, `lib/site-publish/config.ts`) |

Configuration invalide → **toutes** les routes répondent `503 {"transport_error":"RECEIVER_CONFIG_INVALID"}` (ou
`SITE_DB_CONFIG_INVALID`) ; rien n'est stagé ni activé. La configuration est relue à chaque requête. Seule exception
vérifiée au démarrage : la politique `null` hors staging (ci-dessus), qui arrête le processus.

## Ordre de traitement d'une requête, plafonds de corps (review F-01, F-03)

1. Configuration (invalide → `503`).
2. **Porte de transport, AVANT toute lecture du corps et de la base** : `x-c0-key-id` désigne une clé connue de scope
   `site_snapshot.publish`, statut `ACTIVE` ou `VERIFY_ONLY`, et `x-c0-signature` fait 64 hex minuscules ; sinon
   `401 {"error_codes":["SIGNATURE_INVALID"],"stage":"transport_gate"}`. C'est un contrôle d'accès : le HMAC est
   ensuite vérifié par la fonction pure C0 (étape `signature`) ou, pour VERIFY_MEDIA/ACTIVATE, avant tout verrou.
3. **Lecture bornée du corps par route** : `Content-Length` supérieur au plafond → `413` immédiat (corps non lu) ;
   sans `Content-Length`, lecture en flux avec compteur, interrompue au premier octet au-delà du plafond → `413`.
   Corps `413` : `{"outcome":"TRANSPORT_ERROR","transport_error":"BODY_TOO_LARGE","max_bytes":…,"error_codes":[]}`.

| Route | Plafond du corps |
|---|---|
| `POST stage` | 33 554 432 octets (32 MiB, plafond C0 du snapshot, §4) |
| `PUT media/{sha256}` | 20 971 520 octets (20 MiB, taille maximale d'un média C0, §8.5) |
| `POST verify-media`, `POST activate` | 262 144 octets (256 KiB) |
| `GET status` | corps jamais lu |

**Journal** : les refus `401` de la porte de transport, `401` de la vérification HMAC avant verrou (VERIFY_MEDIA,
ACTIVATE, PUT média) et `413` **n'écrivent aucune ligne** (pas de remplissage du journal append-only par un tiers).
Les refus rendus par l'évaluation C0 après la porte (y compris `SIGNATURE_INVALID` du STAGE, où le HMAC ne peut être
calculé qu'après lecture du document) restent journalisés, une ligne bornée par requête. Risque résiduel : le
`key_id` n'est pas secret ; un tiers qui le connaît peut écrire une ligne par STAGE de ≤ 32 MiB — limitation de débit
`DEFERRED_FOR_PROD`.

## Routes machine hors proxy : aucun tampon de corps intermédiaire (DF-0130, I1 R-02)

Les routes `/api/site/publish/**` (ce receiver) et `/api/site/events/**` (annexe BC4) **ne passent par aucun proxy
applicatif ni frontal** qui mettrait le corps en mémoire tampon ou le plafonnerait en dessous des plafonds de la route :

| Route | Plafond porté par la route | Exigence pour tout frontal / proxy devant le SITE |
|---|---|---|
| `POST /api/site/publish/stage` | 32 MiB (33 554 432 octets) | limite de corps **≥ 32 MiB**, corps relayé en flux |
| `PUT /api/site/publish/media/{sha256}` | 20 MiB (20 971 520 octets) | limite **≥ 20 MiB** (en pratique la même règle ≥ 32 MiB sur tout `/api/site/publish/**`) |
| `POST verify-media`, `POST activate`, `/api/site/events/ack` | 256 KiB / 64 KiB | aucune contrainte supplémentaire |

- Dans l'application : `proxy.ts` exclut ces routes de son `matcher` (sinon Next 16 tamponne et **tronque** le corps
  à `proxyClientMaxBodySize`, 10 MiB par défaut : média légitime → 401 `SIGNATURE_INVALID`, STAGE → 400
  `PAYLOAD_MALFORMED`, au lieu d'un 413). Toute nouvelle route machine signée **doit** rejoindre cette exclusion.
  Non-régression : `tests/http/storefront.test.mjs`, section « 4 — routes machine signées hors proxy navigateur »
  (`npm run test:storefront`).
- Devant l'application (frontal, CDN, reverse proxy) : limite de corps ≥ 32 MiB sur ces routes, pas de réécriture
  ni de décompression du corps, pas de cache. Check-list : `docs/DEPLOY_CHECKLIST_SITE.md`.
- C'est la route qui répond `413 BODY_TOO_LARGE` sans lire le corps ; un 413 d'un frontal (corps HTML, sans
  `transport_error`) est une erreur de déploiement, pas un refus C0.

## En-têtes

| En-tête | Valeur |
|---|---|
| `x-c0-key-id` | `key_id` d'une clé de scope `site_snapshot.publish`, statut `ACTIVE` ou `VERIFY_ONLY` |
| `x-c0-signature` | 64 hex minuscules |
| `x-c0-outcome` (réponse) | présent **seulement** quand le corps est un ACK : `ACTIVATED` ou `REPLAY_ACK` |

Signature de publication (C0 §7) : `hex(HMAC-SHA256(secret, "prodes.c0.sig.site_snapshot.v1" || 0x00 ||
canonical({catalogue_sequence, payload_sha256, projection_id, publication_id, scope_key})))`. **La même paire
d'en-têtes** sert à STAGE, VERIFY_MEDIA, ACTIVATE et STATUS pour une génération donnée.

Signature média (**`STAGING_TRANSPORT`, hors C0**) : domaine **`prodes.c0.transport.media.v1`**, même construction,
contexte `{"sha256": <sha du chemin>, "size": <nombre d'octets envoyés>}`, clé de scope `site_snapshot.publish`.

Une clé inconnue, de scope `activation_ack` ou `site_events.read`, `RETIRED`, une signature absente, mal formée ou fausse
→ `401 SIGNATURE_INVALID`, sur **toutes** les routes.

## Routes (Next.js App Router, runtime Node, `cache-control: no-store`)

### `POST /api/site/publish/stage`

Corps : **octets bruts** du snapshot `site_snapshot.v1` (exactement canoniques, ≤ 32 MiB). Évaluation C0 avec un store
média **vide**, l'ACTIVE relue en base, la politique et l'horloge du receiver.

| Étape d'arrêt C0 | Réponse | Persistance |
|---|---|---|
| `parse` `canonical` `version` `shape` `semantic` `integrity` `signature` `sequence` (refus), ou `environment` | refus (tableau des statuts ci-dessous) | journal seulement |
| `sequence` + `REPLAY_ACK` (même séquence et même SHA que l'ACTIVE) | `200`, corps = **ACK stocké, octets identiques**, `x-c0-outcome: REPLAY_ACK` | journal |
| `media` ou au-delà (ou `ACTIVATED` à blanc) | `200 {"accepted":true,"outcome":"STAGED","idempotent":false,"generation":{…}}` — **jamais d'ACK** | ligne `STAGED` |
| ACTIVE relue UNSAFE (F-02) | `409 CATALOG_UNSAFE`, `stage: "active_integrity"` | journal seulement |
| idem, `(séquence, SHA)` déjà reçue | `200 …"idempotent":true…`, `generation.status` = état courant | aucune |

### `PUT /api/site/publish/media/{sha256}`

Corps : octets bruts du média. `Content-Type` facultatif (indicatif). Ordre : porte de transport (`401`) → corps
borné à 20 MiB (`413 BODY_TOO_LARGE`) → chemin (`400 MEDIA_PATH_INVALID`) → signature média (`401 SIGNATURE_INVALID`,
sans journal) → taille ≥ 1 o (`413 MEDIA_SIZE_OUT_OF_RANGE`, sans journal) → SHA-256 recalculé
≠ chemin (`422 MEDIA_HASH_MISMATCH`, rien stocké) → stockage adressé par contenu : `201 STORED`, `200 ALREADY_STORED`,
ou `200 REPAIRED` (octets vérifiés remplaçant une ligne altérée). Le PUT ne vérifie pas le type : c'est VERIFY_MEDIA,
contre le `mime` déclaré par `media_refs` (C0 §8.5).

### `POST /api/site/publish/verify-media`

Corps JSON strict : `{"publication_id", "catalogue_sequence", "payload_sha256"}` (sinon `400 REQUEST_INVALID`).
**Authentification avant tout verrou** (F-03), dans cet ordre : clé de publication (sinon `401`), génération connue
(sinon `404 GENERATION_NOT_STAGED`), HMAC du contexte C0 §7 de la génération **stockée** (sinon `401`,
`stage: "transport_gate"`), sans ligne de journal. Store média = octets des `media_refs` présents en base.

| Arrêt | Réponse | État |
|---|---|---|
| `media` | refus `MEDIA_MISSING` / `MEDIA_HASH_MISMATCH` / `MEDIA_TYPE_REJECTED` | reste (ou redevient) `STAGED` |
| `signature`, `sequence` (refus), `environment` | refus | inchangé |
| `REPLAY_ACK` | `200` ACK stocké | inchangé |
| au-delà de `media` | `200 {"outcome":"MEDIA_VERIFIED","generation":{…"status":"VERIFIED"}}` | `VERIFIED` |

### `POST /api/site/publish/activate`

Même corps, mêmes en-têtes et même authentification avant verrou que verify-media (un ACTIVATE non signé ne prend
aucun verrou). Puis **une transaction** : `SELECT … FOR UPDATE` du pointeur ACTIVE, relecture
de l'ACTIVE dans le verrou, ligne cible `FOR UPDATE`, store média relu en base, **horloge serveur**, appel complet
d'`evaluatePublication`, écritures, journal, **COMMIT, puis** réponse. `lock_timeout` 15 s.

| Résultat C0 | Réponse | Effet (dans la transaction) |
|---|---|---|
| `ACTIVATED` | `200`, corps = ACK (octets canoniques), `x-c0-outcome: ACTIVATED` | cible `ACTIVE` + ACK stocké, ancienne `SUPERSEDED`, pointeur mis à jour |
| `REPLAY_ACK` | `200`, corps = **ACK stocké, octets identiques**, `x-c0-outcome: REPLAY_ACK` | aucun second effet (journal seulement) |
| `STAGE_HOLD` | `202 {"accepted":false,"outcome":"STAGE_HOLD","error_codes":["STAGE_HOLD"],"hold_reason":…}` | cible `HOLD`, ancienne génération servie |
| refus `media` | `422`/`415` | `VERIFIED` → `STAGED` |
| refus `signature` | `401` | aucun |
| autre refus (`STALE_SEQUENCE`, `SEQUENCE_COLLISION`, `IDENTITY_CONFLICT`, `COVERAGE_UNPROVEN`, `CATALOG_UNSAFE`, environnement) | `409`/`422` | cible `REJECTED` (une ligne `ACTIVE`/`SUPERSEDED` garde son statut) |
| ACTIVE relue **UNSAFE** (F-02 : ligne non `ACTIVE`, pointeur ≠ ligne, octets non canoniques, `payload_sha256` recalculé ≠ stocké) | `409 CATALOG_UNSAFE`, `stage: "active_integrity"` | aucune activation par-dessus ; cible inchangée ; refus journalisé |
| exception, connexion perdue, échec du COMMIT | `503 {"transport_error":"ACTIVATION_ABORTED"}` — **aucun ACK** | ROLLBACK complet ; `ACTIVATE_ABORTED` journalisé hors transaction |

`VERIFIED` est **informatif** : il dit « étape `media` franchie », jamais « l'activation passera » ; à l'activation,
`verified_at = COALESCE(verified_at, now)` signifie de même « étape `media` franchie ».

Sur `503`, l'émetteur **rejoue ACTIVATE** à l'identique : si le COMMIT avait eu lieu, il reçoit `REPLAY_ACK` (même ACK).
L'ACTIVATE revérifie les médias lui-même : une génération `STAGED` dont tous les médias sont présents et conformes peut
être activée sans VERIFY_MEDIA préalable ; une activation sans média vérifié est impossible.

### `GET /api/site/publish/status?publication_id=…&catalogue_sequence=…`

En-têtes de publication de la génération (clé hors scope → `401` ; génération inconnue → `404 GENERATION_NOT_STAGED` ;
signature ne correspondant à aucune génération de ce couple → `401`). Réponse `200 {"generation":{publication_id,
projection_id, scope_key, catalogue_sequence, payload_sha256, status, is_active, staged_at_utc, verified_at_utc,
activated_at_utc, has_ack, last_result}}` — **sans octets ni ACK** (l'ACK se récupère par ACTIVATE → `REPLAY_ACK`).

## Corps de refus et statuts HTTP

```json
{"accepted":false,"outcome":"REJECTED","error_codes":["…"],"stage":"…","detail":{…},"operation":"STAGE"}
```

`detail` = `{"rules":[…]}` ou `{"hold_reason":…}` ou `{}` (C0 §8.2, R-14). Statut = HTTP indicatif C0 §13 du **premier**
code de `error_codes` (liste triée) : `PAYLOAD_MALFORMED` 400, `SCHEMA_UNSUPPORTED` 400, `SIGNATURE_INVALID` 401,
`IDENTITY_CONFLICT` / `STALE_SEQUENCE` / `SEQUENCE_COLLISION` / `CATALOG_UNSAFE` 409, `MEDIA_TYPE_REJECTED` 415,
`STAGE_HOLD` 202, autres codes snapshot 422. Erreurs de transport (non C0) : `{"outcome":"TRANSPORT_ERROR",
"transport_error":…, "error_codes":[]}` — `REQUEST_INVALID` 400, `MEDIA_PATH_INVALID` 400, `GENERATION_NOT_STAGED` 404,
`MEDIA_SIZE_OUT_OF_RANGE` 413, `BODY_TOO_LARGE` 413, `ACTIVATION_ABORTED` 503, `RECEIVER_UNAVAILABLE` 503, `RECEIVER_CONFIG_INVALID` 503,
`SITE_DB_CONFIG_INVALID` 503.

## Contrôle d'environnement `data_label` (contrôle receiver, C0 §15)

`SITE_ENV=staging` refuse `data_label: "PRODUCTION"` ; `SITE_ENV=production` refuse `"STAGING_FIXTURE"` →
`SNAPSHOT_INVALID`, `detail.rules: ["envelope.data_label_environment"]`, `stage: "environment"`. Appliqué dès que
l'évaluation C0 a dépassé `shape` : une faute `parse`/`canonical`/`version`/`shape` prime, le contrôle précède toute
étape `semantic` et suivante. Non implémenté dans les fonctions pures C0 (paramètre d'environnement).

## Séquence type pour BC5

```text
1. POST stage            (octets + en-têtes)             -> 200 STAGED            | 200 REPLAY_ACK (fin) | refus
2. PUT  media/{sha} × N  (un par media_refs, signé média) -> 201 / 200
3. POST verify-media     (corps de contrôle + en-têtes)  -> 200 MEDIA_VERIFIED    | 422/415 MEDIA_*
4. POST activate         (idem)                          -> 200 ACK (ACTIVATED)   | 202 STAGE_HOLD | 409/422 | 503 -> rejouer 4
5. persister l'ACK reçu ; vérifier avec verify_ack (C0) ; rejouer 1 ou 4 à l'identique redonne les mêmes octets.
```

Recette : `tests/bc2/*.test.mjs` (`npm run test:bc2`) et `tests/bc2/http-smoke.mjs` (serveur réel).

## Ce que ce transport ne prouve pas

HTTPS, authentification de production, secrets réels et leur rotation, anti-rejeu horodaté (une signature de PUT
média se rejoue sans limite de temps, sans effet grâce à l'adressage par contenu — F-08), limites de débit, CDN, Unicode au-delà de 14.0 entre Python et Node
(DF-0089), signature asymétrique de l'ACK (DF-0093).

---

# Annexe BC4 — poll / ACK des événements `site_events.v1` (`STAGING_TRANSPORT`, consommée par BC5/I1)

Statut : `TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`. **Hors contrat C0** (C0 §15 : transport `DEFERRED_FOR_PROD`) : C0 fige les
octets d'événement, `payload_digest`, les scopes et `validatePollRequest` ; tout ce qui suit est le transport de staging W1.
Polling **sortant** depuis la Factory. Implémentation : `lib/site-transactions/events.ts`.

## Configuration

| Variable | Valeur |
|---|---|
| `SITE_DATABASE_URL` | base `prodes_site*` |
| `SITE_KEYRING_PATH` | trousseau C0 (staging : `c0/fixtures/keys/test_keyring.json`, clé de lecture `c0-test-events-01`) |

Configuration invalide → `503 {"transport_error":"TRANSACTIONS_CONFIG_INVALID"}` (ou `SITE_DB_CONFIG_INVALID`).

## `GET /api/site/events?cursor=<curseur|vide>&limit=<1…500>`

En-têtes : `x-c0-key-id` (clé de scope **`site_events.read`**, `ACTIVE`/`VERIFY_ONLY`) et `x-c0-signature` :

```text
signature = hex(HMAC-SHA256(secret_utf8, "prodes.c0.transport.events_poll.v1" || 0x00 || canonical({cursor, limit})))
  cursor = null au premier poll (paramètre absent ou vide), sinon la chaîne next_cursor reçue
  limit  = entier si le paramètre est un décimal strict, sinon la chaîne brute (refusée ensuite CURSOR_INVALID)
```

Ordre : (1) clé de scope `site_events.read` **et** signature valide, sinon `401 EVENT_UNAUTHORIZED` (clé de publication,
d'ACK, inconnue, `RETIRED`, signature absente/fausse/autre contexte/autre domaine) ; (2) `validatePollRequest(
{credential_key_id, cursor, limit}, keyring, curseurs émis à CETTE clé)` → `400 CURSOR_INVALID` (curseur jamais émis ou émis à
une autre clé, `limit` hors 1…500 ou non entier) ; (3) une transaction : événements **non acquittés** (`PENDING` ou
`DELIVERED_TO_POLL`) dans l'ordre `id`, au plus `limit`, `FOR UPDATE` → `DELIVERED_TO_POLL`, `delivery_count + 1` → nouveau
curseur opaque `CUR-<32 hex>` enregistré (`site_event_cursor`, avec la liste des `event_id` servis) → COMMIT → réponse :

```json
{"contract_version":"site_events.v1","transport":"STAGING_TRANSPORT","accepted":true,"outcome":"SERVED",
 "cursor":null,"next_cursor":"CUR-…",
 "events":[{"event_id":"EVT-…","event_sha256":"<sha256 des octets>","event_bytes_b64":"<octets canoniques exacts, base64>"}]}
```

Le consommateur décode `event_bytes_b64` et passe **ces octets** à `validate_event` (C0 §11.2) : jamais une re-sérialisation.
**Livraison au moins une fois** : un événement servi mais non acquitté est **re-servi** à chaque poll suivant, avant les plus
récents (le consommateur le reconnaît `EVENT_DUPLICATE_NOOP`, CE-T18). Un poll sans événement émet quand même un nouveau
curseur (`events: []`). Le curseur **n'avance pas** la lecture : sa `position` est enregistrée mais n'est pas lue ; seul l'ACK
fait progresser le flux.

**Rejeu d'une requête de poll signée (review F-01).** La signature ne porte que `{cursor, limit}`, sans horodatage ni nonce : une
requête capturée peut être rejouée tant que la clé est valide. **Chaque** rejeu (a) renvoie à son porteur tous les événements non
acquittés (dans la limite), (b) insère une ligne dans `site_event_cursor` (append-only, aucune purge en W1), (c) incrémente
`delivery_count` des événements servis (et passe les `PENDING` en `DELIVERED_TO_POLL`). Il ne crée ni ne modifie aucun événement
ni aucun ACK. Acceptable en `STAGING_TRANSPORT` seulement ; avant production : anti-rejeu horodaté/nonce signé et purge des
curseurs (NON-OUBLI).

**Événement empoisonné (review F-02, `REQUIRES_OWNER_DECISION`).** Les événements non acquittés sont toujours re-servis **en tête**.
Un événement que la Factory refuse durablement (C0 §13 : `EVENT_PAYLOAD_INVALID`, `EVENT_IDEMPOTENCY_CONFLICT`, `EVENT_TYPE_UNKNOWN`
= « non acquitté ») reste donc en tête ; s'il y en a au moins `limit`, **le flux est bloqué** pour toujours (aucun événement plus
récent n'est servi). W1 ne change pas ce comportement. Options à trancher par le propriétaire : (1) quarantaine explicite côté
Factory par ACK d'`event_ids` (l'événement sort du flux, la trace du refus reste à la Factory) ; (2) statut SITE `REFUSED` posé par
une route d'ACK-refus signée (l'événement reste visible côté SITE, hors flux). En attendant, BC5 doit choisir `limit` assez grand et
alerter dès qu'un même `event_id` revient refusé.

## `POST /api/site/events/ack`

Corps JSON strict (≤ 64 Kio) : exactement `{"cursor":"CUR-…"}` (acquitte les événements servis sous ce curseur) **ou**
`{"event_ids":["EVT-…", …]}` (1…500 identifiants distincts). En-têtes `x-c0-key-id` / `x-c0-signature` :

```text
signature = hex(HMAC-SHA256(secret_utf8, "prodes.c0.transport.events_ack.v1" || 0x00 || canonical(<corps lu>)))
```

Ordre : scope `site_events.read` (`401 EVENT_UNAUTHORIZED`) → corps (`400 CURSOR_INVALID`) → signature (`401
EVENT_UNAUTHORIZED`) → curseur émis à cette clé (`400 CURSOR_INVALID`) → `DELIVERED_TO_POLL → ACKED` :

```json
{"accepted":true,"outcome":"ACKED","acked":[…],"already_acked":[…],"not_delivered":[…],"unknown":[…]}
```

Un événement `PENDING` (jamais servi) n'est pas acquittable (`not_delivered`) ; un ACK répété est sans effet
(`already_acked`). **La Factory n'acquitte qu'après sa propre transaction** (C0 §11.2) ; un ACK perdu ramène l'événement.

## Séquence type pour BC5

```text
1. GET  /api/site/events?cursor=&limit=N        (signé {cursor:null, limit:N})        -> events[], next_cursor C1
2. pour chaque événement : validate_event(octets, consumed) -> APPLY (persister) | DUPLICATE_NOOP (rien)
3. COMMIT Factory, puis POST /api/site/events/ack {"cursor":"C1"} (signé)            -> acked[]
4. GET  /api/site/events?cursor=C1&limit=N      (signé {cursor:"C1", limit:N})        -> suite
   (perte de l'étape 3 : l'étape 4 re-sert les mêmes octets ; validate_event -> EVENT_DUPLICATE_NOOP ; ré-ACK)
```

Recette : `tests/bc4/10_events_poll_ack.test.mjs` (`npm run test:bc4`) et `tests/bc4/http.e2e.mjs` (`npm run test:bc4:http`,
serveur réel 127.0.0.1:3351).

## Ce que cette annexe ne prouve pas

Poll réel prolongé (48 h), anti-rejeu horodaté (une requête de poll signée peut être rejouée : effets ci-dessus), traitement d'un
événement empoisonné, HTTPS, débit, rotation réelle des clés de lecture, purge des curseurs, signature asymétrique.
