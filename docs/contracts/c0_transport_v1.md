# Transport de la liaison Factory → SITE — v1 (cercle 4, lot T)

> Écrit le 17/11/2026, lignes 4.1 à 4.5 du [cercle 4](../roadmap/cercles/CERCLE_4_TAMPON.md), attendus L01 à L18.
> **Hors contrat C0.** Les contrats [`c0_site_v1.md`](c0_site_v1.md) et [`c0_site_v2.md`](c0_site_v2.md) ne changent ni au manifeste ni à l'octet : les signatures C0 (`x-c0-key-id`, `x-c0-signature`) restent ce qu'elles sont. Ce document ajoute ce que le transport exige quand le SITE quitte le poste. Il est recopié tel quel dans le dépôt du SITE (`docs/contracts/c0_transport_v1.md`).
> Code : Factory `projections/site_link.py`, `projections/site_transport.py` ; SITE `lib/site-publish/transport-gate.ts`, `lib/site-link/link.ts`, `scripts/keyring-create.mjs`.

## 1. Adresse (4.1)

- Un seul réglage côté Factory : `PRODES_SITE_URL`, lu par la boucle, le relevé des événements et les boutons. Une option `--site-url` de commande le remplace.
- **Locale** : l'hôte est écrit `127.0.0.1`, `localhost` ou `::1`. La règle lit le texte de l'adresse, jamais une résolution DNS. `http://` et `https://` sont admis.
- **Distante** : tout autre hôte. `https://` obligatoire ; le certificat et le nom d'hôte sont vérifiés. `PRODES_SITE_CA_FILE` désigne une autorité d'essai (fichier PEM) ; vide, c'est le magasin du système.
- Toujours : aucune redirection suivie, aucun mandataire (proxy), ni identifiant, ni chemin, ni paramètre, ni fragment dans l'adresse.

| Refus | Message |
|---|---|
| `SITE_URL_REMOTE_WITHOUT_HTTPS` | adresse distante sans HTTPS |
| `SITE_URL_FORBIDDEN_PART` | adresse du site refusée : ni identifiant, ni chemin, ni paramètre, ni fragment |
| `SITE_CERTIFICATE_REFUSED` | certificat du site refusé (réessayé au tour suivant) |
| `TRANSPORT_REDIRECT_REFUSED` | le SITE a répondu par une redirection |

## 2. Trousseau (4.2)

Un fichier JSON hors Git, **le même des deux côtés** (secrets partagés, décision A5), lisible par son seul propriétaire :

```json
{
  "keyring_version": "prodes.site_keyring.v1",
  "nature": "test",
  "created_utc": "2026-11-17T20:00:00Z",
  "keys": [
    {"key_id": "essai-publish-01", "scope": "site_snapshot.publish", "status": "ACTIVE", "secret_utf8": "TEST_SECRET_NOT_FOR_PRODUCTION…"},
    {"key_id": "essai-ack-01", "scope": "activation_ack", "status": "ACTIVE", "secret_utf8": "TEST_SECRET_NOT_FOR_PRODUCTION…"},
    {"key_id": "essai-events-01", "scope": "site_events.read", "status": "ACTIVE", "secret_utf8": "TEST_SECRET_NOT_FOR_PRODUCTION…"}
  ]
}
```

- Une entrée de clé a exactement la forme C0 (`key_id`, `scope`, `status`, `secret_utf8` d'au moins 32 octets ; c0 v1 §7).
- **Un secret par usage** : publication, accusé, événements, ce sont les trois portées C0. L'aperçu est signé par la clé de publication (c0 v2 §4.5).
- `nature` : `test` ou `real`. Un trousseau `test` porte le préfixe `TEST_SECRET_NOT_FOR_PRODUCTION` sur tous ses secrets, un trousseau `real` sur aucun. Le trousseau de test C0 (`c0.test_keyring.v1`, `c0/fixtures/keys/test_keyring.json`) est de nature `test`.
- **Garde, avant tout envoi** : une clé `test` vers une adresse distante est refusée (`KEY_TEST_REMOTE`, « clé de test interdite hors du poste »). Une clé `real` vers une adresse locale est refusée (`KEY_REAL_LOCAL`, « clé réelle interdite vers un site local »).
- Réglages Factory :
  - `PRODES_SITE_KEYRING_PATH` : le chemin du trousseau ;
  - `PRODES_SITE_KEY_ID` : la clé de publication qui signe ; vide, c'est la seule clé de publication `ACTIVE` ;
  - `PRODES_SITE_EVENTS_KEY_ID` : la clé des événements ; vide, c'est la seule clé d'événements `ACTIVE`.
  Côté SITE : `SITE_KEYRING_PATH`.
- **Changer de clé sans coupure** :
  1. ajouter une clé `ACTIVE` du même usage (le SITE accepte alors les deux) ;
  2. régler la Factory sur la nouvelle ;
  3. passer l'ancienne en `RETIRED`, ou la retirer.
  Une clé retirée ou inconnue reçoit 401 `KEY_UNKNOWN`, affiché « clé inconnue du site ».
- **Générateur de référence** : `node scripts/keyring-create.mjs` (dépôt du SITE, Node sans dépendance). Les vrais secrets naissent sur le serveur, qui n'a pas Python. Il écrit le fichier en mode 0600, n'écrase jamais un fichier et n'affiche jamais une valeur.
- **Côté Factory** : `manage.py site_keyring check <trousseau>` vérifie le format, la nature et les identifiants. `manage.py site_keyring make …` fabrique un trousseau pour les tests et pour le poste de recette ; il refuse d'écrire dans un dossier suivi par Git.

## 3. Anti-rejeu daté (4.4)

Chaque requête signée de la Factory porte, en plus des en-têtes C0 :

| En-tête | Valeur |
|---|---|
| `x-c0-issued-at` | instant UTC `AAAA-MM-JJTHH:MM:SSZ` |
| `x-c0-nonce` | 32 caractères hexadécimaux minuscules, nouveaux à chaque requête (un nouvel essai est une nouvelle requête) |
| `x-c0-request-signature` | `hex(HMAC-SHA256(secret de x-c0-key-id, "prodes.c0.transport.request.v1" 0x00 JSON canonique du contexte))` |

Contexte, en JSON canonique C0 :

```json
{"method": "POST", "path": "/api/site/publish/stage", "body_sha256": "<sha256 hex du corps, celui d'un corps vide pour GET>", "issued_at_utc": "…", "nonce": "…"}
```

`path` est le chemin tel qu'envoyé, requête comprise (`/api/site/publish/status?publication_id=…&catalogue_sequence=…`). La clé signe dans sa propre portée : publication pour les routes de publication, de contenu, d'aperçu et la sonde ; événements pour le relevé et son accusé.

Routes contrôlées par le SITE :
- `/api/site/publish/stage`, `media/{sha256}`, `media/missing`, `verify-media`, `activate` et `status` ;
- `/api/site/content/activate` et `/api/site/content/preview` ;
- `/api/site/events/ack` ;
- `/api/site/link/probe`.

Le relevé (`GET /api/site/events`) est déjà daté par sa signature `prodes.c0.transport.events_poll.v2` (même fenêtre, nonces en base depuis DF-0115). La Factory y ajoute la signature de transport, sur le même instant et le même nonce ; le SITE continue de contrôler la sienne.

Le SITE, après la porte C0 habituelle et la lecture bornée du corps (`lib/site-publish/http.ts`, `lib/site-publish/transport-gate.ts`) :

| Contrôle | Refus (401, `transport_error`) |
|---|---|
| clé absente ou retirée de son trousseau | `KEY_UNKNOWN` |
| un des trois en-têtes manque | `REQUEST_UNDATED` |
| signature fausse | `REQUEST_SIGNATURE_INVALID` |
| écart de plus de 300 s entre `x-c0-issued-at` et son horloge | `REQUEST_STALE` (L16) |
| nonce déjà vu pour cette clé | `REQUEST_REPLAYED` (L15) |

- Le corps d'un refus porte `server_time_utc`.
- Les nonces sont gardés en base (`site_request_nonce`, migration SQL 021) au moins une heure : un redémarrage ne les oublie pas (DF-0115).
- Côté Factory, un `REQUEST_STALE` s'affiche « horloges désaccordées » (L17), avec l'écart lu sur l'heure signée de la sonde.

## 4. Médias manquants seulement (4.3)

`POST /api/site/publish/media/missing` est signée par le point 3, avec la clé de publication. Elle ne porte pas de signature C0.

- Corps : `{"media": [{"sha256": "…", "size": 123}]}`, 5 000 entrées au plus.
- Réponse 200 : `{"outcome": "MEDIA_MISSING", "missing": ["<sha256>", …]}`, avec les empreintes absentes du SITE, dans l'ordre demandé.

Ordre d'une publication :
1. STAGE ;
2. MEDIA_MISSING (par lots de 5 000) ;
3. PUT des seuls médias manquants ;
4. VERIFY_MEDIA ;
5. ACTIVATE.

Chaque PUT lit le fichier du média en flux. Délai accordé : **15 s + 1 s par Mio entamé** (30 Mio → 45 s, L14).

Une coupure laisse la génération non activée ; le tour suivant redemande et n'envoie que le reste (L13). Le rapport de publication et la ligne du tour portent `"media": {"sent", "already_present", "bytes_sent"}`, lus par l'écran Publication : « N envoyés, M déjà présents ».

## 5. Sonde et réponses signées (4.5)

`GET /api/site/link/probe` est signée par le point 3, avec la clé de publication. Elle n'envoie rien d'autre. Réponse 200 :

```json
{"probe_version": "prodes.site_link_probe.v1", "outcome": "OK", "server_time_utc": "…", "request_nonce": "<x-c0-nonce reçu>",
 "key_id_seen": "<x-c0-key-id reçu>",
 "site": {"commit": "…", "active_publication": {"publication_id": "…", "catalogue_sequence": 7}, "active_content_sha256": "…",
          "db_bytes": 0, "disk_free_bytes": 0, "disk_total_bytes": 0, "last_backup_utc": null}}
```

Hors fenêtre, la sonde répond quand même : `"outcome": "CLOCK_SKEW"`, son heure, sans `site`, et sans garder le nonce. C'est ainsi que l'écran affiche l'écart.

Le SITE signe chacune de ses réponses à une requête signée :
- `x-c0-response-key-id` : sa clé `activation_ack` `ACTIVE` ;
- `x-c0-response-signature` : `hex(HMAC-SHA256(secret, "prodes.c0.transport.response.v1" 0x00 JSON canonique de {"request_nonce", "http_status", "body_sha256"}))`.

La Factory exige cette signature sur la sonde, sur STATUS et sur MEDIA_MISSING quand l'adresse est distante ; elle la vérifie partout où elle est présente. Absente (adresse distante) ou fausse : « réponse du site non reconnue » (`SITE_RESPONSE_UNRECOGNISED`), et le tour n'envoie rien (L18).

## 6. État de la liaison (écran Liaison, bandeau)

`projections.site_link.test_link()` est appelée par « Tester la liaison » et au début de chaque tour de la boucle, qui l'écrit dans le battement (`heartbeat.json`, clé `link`).

Valeurs de `state` :
- `REACHABLE` ;
- `UNREACHABLE` ;
- `CONFIG_REFUSED` ;
- `CERTIFICATE_REFUSED` ;
- `KEY_UNKNOWN` ;
- `CLOCK_SKEW` ;
- `RESPONSE_UNRECOGNISED`.

Avec `CONFIG_REFUSED`, `CERTIFICATE_REFUSED`, `KEY_UNKNOWN`, `CLOCK_SKEW` ou `RESPONSE_UNRECOGNISED`, le tour n'envoie rien.

Champs : `url`, `url_kind`, `key_id`, `keyring_nature`, `clock_skew_seconds`, `certificate_not_after_utc` (https seulement) et `site` (les champs de la sonde). Jamais une valeur de clé.
