# W1 / BC4 — Transactions SITE (devis, commandes, idempotence, outbox, reçu, poll/ACK) — rapport builder

Statut maximal revendiqué : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`** (Mac local, PostgreSQL 18.6 port 54318, fixtures C0
synthétiques `STAGING_FIXTURE`). Pas d'auto-approbation : review indépendante (opus : concurrence, idempotence, sécurité) attendue.

- Dépôt Commerce, worktree `/Users/nico/Desktop/prodes-w1/commerce-bc4`, branche `build/w1-bc4-transactions`.
- Base : BC2 `build/w1-bc2-receiver@a9dede14` + fusion `--no-ff` de A2 `build/w1-a2-app-on-c0@aa022a67` (commit `09c0168f`,
  seul fichier commun `package.json`, hunks disjoints, sans conflit).
- **SHA testé (code) : `3ebbb48d`** (`evidence/W1/BC4/raw/env.txt`). Le commit de preuves suit (aucun code).
- C0 vendu inchangé : `C0_VENDOR_OK sha=b88f5cdf… tree_digest=b73f1968…` (`raw/c0_check.txt`).
- Bases : `prodes_site_bc4` (dev, migrations appliquées), `prodes_site_bc4_test` (tests). Port HTTP : **3351** seulement.

## Résultats

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Fusion A2 dans BC2 | ✅ | commit `09c0168f` ; gates post-fusion vertes | si la tête A2 bouge, l'intégrateur refait la fusion |
| Migrations `010`–`015` (idempotence, devis, commandes, outbox, curseurs, journal) | ✅ | `db/migrations/010…015`, `raw/migrate_dev.txt` | plage `016`–`019` libre |
| Gardes en base : ≥ 1 ligne, `total_cents = Σ`, Money ↔ centimes, lignes/outbox immuables, statut monotone | ✅ | `tests/bc4/08` (COMMIT refusé `23514`, triggers) | rôle de test propriétaire des tables : un superutilisateur peut désactiver les triggers |
| Aucune colonne taxe/port/paiement/statut client, aucun flottant/numeric | ✅ | `tests/bc4/09` (information_schema) | contrôle par motif de nom |
| F1 commande valide → 1 objet, 2 lignes figées, 1 idempotence, 1 `order.received` `APPLY`, `total_cents` exact | ✅ | `01_order_valid` 2/2 (`F_QUOTE_ORDER.order_valid`) | |
| F2 CE-T03 concurrence (barrière forcée + 8 POST) → 1 objet, 1 événement, même reçu | ✅ | `02_concurrent_same_key` 5/5 ; HTTP `http.e2e` A | « deux réponses identiques » = **même `receipt`** ; le jeton n'est que dans la 1re (décision 3) |
| F3 même clé autre payload → 409 ; lignes réordonnées → même reçu | ✅ | `03_idempotency_conflict` 4/4 (`order_same_key_other_payload`, `order_replay_lines_reordered`, `quote_same_key_other_payload`) | |
| F4 CE-T16 falsifications → `PRICE_CHANGED`, `INVALID_VARIANT`, `ITEM_NOT_PUBLISHED`, `ITEM_SUPERSEDED` + canonique, 0 Order | ✅ | `04_falsified_and_items` 15/15 (F_QUOTE_ORDER, F_ESUNNY_FORBIDDEN, F_IDENTITY a→b→c) | |
| F5 CE-T12 `CART_STALE` / `CATALOG_CHANGED` ; `UNSAFE` → `CATALOG_UNSAFE` | ✅ | `05_stale_unsafe` 5/5 | UNSAFE simulé par octets ACTIVE altérés (aucun marquage opérationnel en W1, cf. BC2) |
| F6 devis non chiffré → `RECEIVED`, `priced:false`, aucun montant | ✅ | `06_quote_unpriced` 3/3 (`quote_unpriced_no_window`, `quote_priced`) | |
| F7 DB coupée → `DB_WRITE_FAILED` 503, 0 ligne | ✅ | `07_db_down` 3/3 (base inexistante ; `pg_terminate_backend` après INSERT objet ; avant COMMIT) ; HTTP `http.e2e` B | perte de connexion **pendant** le COMMIT (issue ambiguë) non provoquée : le rejeu à l'identique la résout (REPLAY) |
| F8 crash injecté objet → outbox : rollback complet, rejeu → RECEIVED | ✅ | `08_crash_rollback` 6/6 | injection par crochet de test (`hooks`), jamais exposé par les routes |
| F9 0 / 201 lignes, taxe/port/statut/paiement → `INVALID_DATA` ; flottant/BOM/… → `PAYLOAD_MALFORMED` ; aucune PII dans `event_bytes` | ✅ | `09_shape_and_pii` 11/11 | |
| F10 CE-T17/T18/T19 poll : reçus, re-servis sans ACK (`EVENT_DUPLICATE_NOOP` côté consommateur), non re-servis après ACK, `EVENT_UNAUTHORIZED`, `CURSOR_INVALID` | ✅ | `10_events_poll_ack` 9/9 ; HTTP `http.e2e` A | poll 48 h réel **non** prouvé |
| F11 reçu : 200 / 401 / 404 indiscernables | ✅ | `11_receipt` 4/4 (`lookup_*`) ; HTTP | jeton en paramètre d'URL (journaux de proxy) : `DEFERRED_FOR_PROD` |
| F12 historique figé après nouvelle activation ; rejeu → reçu d'origine ; ancienne séquence → `CART_STALE` | ✅ | `12_history_frozen` 3/3 (F_IDENTITY gen_a → b → c) | commande construite par `selectPrice` C0 sur gen_a |
| `npm run test:bc4` | ✅ | **70/70**, 0 skip (`raw/test_bc4.txt`, `raw/test_bc4_per_family.txt`) | |
| `npm run test:bc4:http` (next start réel, 3351) | ✅ | **7/7** (`raw/test_bc4_http.txt`) | |
| `npm run build`, `typecheck`, `c0:check`, `c0:vendor-test`, `c0:test` | ✅ | `raw/build.txt`, `typecheck.txt`, `c0_check.txt`, `c0_vendor_test.txt` 4/4, `c0_ts_test.txt` 9/9 | |
| Tests BC2 sur la branche | ✅ | **50/50** (`raw/test_bc2_on_bc4_db.txt`) | rejoués sur `prodes_site_bc4_test`, **pas** via `npm run test:bc2` littéral (qui vise `prodes_site_bc2_test`, base de BC2 : aucune base partagée) ; même commande sinon |
| Tests HTTP A2 sur la branche | ✅ | **81/81** (`raw/test_http_a2_port3351.txt`) | rejoués sur une copie temporaire où **seul** `PORT` 3341 → 3351 change (`raw/test_http_a2_port_diff.txt`), copie supprimée |
| Docs BC4 | ✅ | `docs/SITE_DB_SCHEMA.md` § BC4, `docs/SITE_TRANSPORT_STAGING.md` annexe poll/ACK | |
| Suite Factory complète / `check_skips` / `verify_source_manifest` / `non_oubli` | ⏸️ | non exécutés | lot Commerce seul : aucun fichier Factory ni `c0/` touché |
| Poll réel 48 h, volumétrie, secrets réels, HTTPS, anti-rejeu | ⏸️ | — | hors W1 (`DEFERRED_FOR_PROD`) |

Rejeu : `evidence/W1/BC4/raw/replay_gates.sh` (sorties dans `raw/`, résumé `raw/summary.txt`). Les compteurs ci-dessus
comptent des tests `node --test` ; ils ne mesurent ni la couverture de code, ni la charge, ni la durée réelle de polling.

## Fichiers

- Nouveaux : `db/migrations/010_site_idempotency.sql`, `011_site_quote.sql`, `012_site_order.sql`, `013_site_outbox_event.sql`,
  `014_site_event_cursor.sql`, `015_site_transaction_log.sql` ; `lib/site-transactions/{common,business,receipt,events,config,http}.ts` ;
  `app/api/site/receipt/route.ts`, `app/api/site/events/route.ts`, `app/api/site/events/ack/route.ts` ; `tests/bc4/*.test.mjs`
  (12 familles), `tests/bc4/helpers.mjs`, `tests/bc4/http.e2e.mjs` ; `tsconfig.bc4.json` ; `evidence/W1/BC4/**`.
- Modifiés : `app/api/site/quote/route.ts`, `app/api/site/order/route.ts` (aiguillage BC4 / A2), `package.json` (scripts
  `bc4:build`, `test:bc4`, `test:bc4:http`), `.gitignore` (`/.bc4-build/`, une ligne à côté de `/.bc2-build/`),
  `docs/SITE_DB_SCHEMA.md`, `docs/SITE_TRANSPORT_STAGING.md` (sections ajoutées ; texte BC2 inchangé sauf la ligne des plages).
- Non touchés : `c0/`, tables/migrations BC2, `lib/site-db`, `lib/site-publish`, `lib/site-catalog`, `lib/site-business`, `components/`.

## Décisions prises (réversibles)

1. **Aiguillage des routes devis/commande** par `SITE_BUSINESS_PERSISTENCE` : `postgresql` → BC4 durable ; absente → comportement
   A2 inchangé (`NONE_UNTIL_BC4`, `durable:false`, garde les tests A2 verts) ; autre valeur → 503. Voir question 1.
2. **Génération jugeante = ACTIVE en base** (`readActiveForUpdate`), indépendamment de `SITE_CATALOG_SOURCE` (source des pages A2).
   Aucune ACTIVE → `503 CATALOG_UNAVAILABLE NO_ACTIVE_GENERATION` ; octets ACTIVE illisibles (C0 ne peut construire `Generation`)
   → `503 ACTIVE_GENERATION_UNREADABLE` : aucun verdict inventé.
3. **Jeton d'accès renvoyé une seule fois** : le rejeu (y compris le perdant d'une course CE-T03) rend le **même reçu** sans jeton.
4. **Idempotence d'abord dans les écritures** : `INSERT site_idempotency … ON CONFLICT DO NOTHING`, puis relecture et **nouveau
   verdict C0** avec le registre relu (C0 dit REPLAY ou `DUPLICATE_KEY_DIFFERENT_PAYLOAD`).
5. **`idempotency_key` de l'événement** = `<event_type>:<object_ref>` (convention des fixtures C0), jamais la clé client.
6. **`offer_price_version_public` des lignes de devis chiffrées** relu par `selectPrice` C0 (même génération, même instant, égalité
   exigée), car la ligne de devis C0 ne le porte pas.
7. **Poll** : sert les non acquittés dans l'ordre `id` (au moins une fois) ; curseur = une livraison (liste des `event_id`), lié à la
   clé ; ACK par curseur ou par `event_ids` ; domaine d'ACK `prodes.c0.transport.events_ack.v1` ajouté (le mandat ne nommait que
   celui du poll) ; octets d'événement en base64 dans la réponse pour préserver l'exactitude.
8. **Échecs SQL en cours de transaction** → `DB_WRITE_FAILED` 503 avec `detail.reason` = SQLSTATE ; échec du journal sans effet.
9. **Correctif de robustesse** : écouteur `error` sur chaque connexion empruntée (`checkout`) — sans lui, une connexion tuée pendant
   la transaction levait une exception non capturée (arrêt du processus Node), révélé par `07_db_down`.

## Dettes découvertes (candidates NON-OUBLI, rien de clos)

- Table HTTP indicative C0 §13 dupliquée entre `lib/site-business/validate.ts` (A2) et `lib/site-transactions/common.ts` (alias `@/`
  non résolu par le build `tsc` des tests) : à factoriser à l'intégration.
- `site_event_cursor` et `site_outbox_event` (ACKED) croissent sans purge ; un curseur par poll.
- Requête de poll signée rejouable (pas d'horodatage) : sans autre effet que re-servir les non acquittés.
- `lib/site-publish` (BC2, `activate`) n'écoute pas `error` sur le client emprunté : même risque d'exception non capturée si la
  connexion est tuée pendant une activation (non testé ici, signalé à BC2/intégrateur).
- `PENDING_REVIEW` : admis par le schéma, aucune route ni règle (décision métier).

## Ce qui n'est pas prouvé

Poll réel sur 48 h depuis la Factory (BC5/I1), consommation par le vrai gestionnaire Factory, volumétrie et débit, PostgreSQL hors
Mac, sauvegarde/réplication, secrets réels et rotation, HTTPS, anti-rejeu, perte de connexion exactement pendant le COMMIT,
charge prolongée, UI (BC3), accès Factory aux coordonnées (route scopée `DEFERRED_FOR_PROD`).

## Questions `REQUIRES_OWNER_DECISION`

1. Une fois l'intégration faite, la variable absente doit-elle **refuser** (503) les commandes au lieu de servir le verdict A2 non
   durable ? (Proposition : oui.)
2. Jeton d'accès au reçu dans l'URL (`?access_token=`) : acceptable en W1, ou en-tête/POST exigé avant la production ?
3. Rétention : durée de conservation des événements `ACKED`, des curseurs, et des devis/commandes (coordonnées du contact) ?
4. `PENDING_REVIEW` : qui déclenche cette transition, sur quelle règle ?
