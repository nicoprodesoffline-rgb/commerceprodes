# W1 / BC4 — Transactions SITE (devis, commandes, idempotence, outbox, reçu, poll/ACK) — rapport builder

Statut maximal revendiqué : **`TESTED_SYNTHETIC / SITE_DB_REAL_LOCAL`** (Mac local, PostgreSQL 18.6 port 54318, fixtures C0
synthétiques `STAGING_FIXTURE`). Pas d'auto-approbation : review indépendante (opus : concurrence, idempotence, sécurité) attendue.

- Dépôt Commerce, worktree `/Users/nico/Desktop/prodes-w1/commerce-bc4`, branche `build/w1-bc4-transactions`.
- Base : BC2 `build/w1-bc2-receiver@a9dede14` + fusion `--no-ff` de A2 `build/w1-a2-app-on-c0@aa022a67` (commit `09c0168f`,
  seul fichier commun `package.json`, hunks disjoints, sans conflit).
- **SHA testé (code) : `1cee6e0e`** après les correctifs de review (`evidence/W1/BC4/raw/env.txt`) ; première livraison testée à
  `3ebbb48d`, review indépendante `REVIEW_PASS` à `0d21981e` (0 bloquant, 0 majeur, 4 mineurs). Le commit de preuves suit (aucun code).
- C0 vendu inchangé : `C0_VENDOR_OK sha=b88f5cdf… tree_digest=b73f1968…` (`raw/c0_check.txt`).
- Bases : `prodes_site_bc4` (dev, migrations appliquées), `prodes_site_bc4_test` (tests). Port HTTP : **3351** seulement.

## Résultats

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| Fusion A2 dans BC2 | ✅ | commit `09c0168f` ; gates post-fusion vertes | si la tête A2 bouge, l'intégrateur refait la fusion |
| Migrations `010`–`016` (idempotence, devis, commandes, outbox, curseurs, journal, `receipt_bytes`) | ✅ | `db/migrations/010…016`, `raw/migrate_dev.txt` (016 appliquée), `raw/migrate_dev_again.txt` (second passage : tout `skip`, `applied=0`) | plage `017`–`019` libre ; 016 `NOT NULL` échoue fort sur une table non vide (aucune donnée déployée) |
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
| F-03 reçu rejoué identique octet pour octet (séquentiel, concurrent, réordonné, tardif, consultation) | ✅ | `13_receipt_bytes` 3/3 | octets identiques pour la clé `receipt` ; `outcome`, `instant_utc` et `access_token` diffèrent légitimement |
| `npm run test:bc4` | ✅ | **73/73** (70 + 3 F-03), 0 skip (`raw/test_bc4.txt`, `raw/test_bc4_per_family.txt`) | |
| `npm run test:bc4:http` (next start réel, 3351) | ✅ | **7/7** (`raw/test_bc4_http.txt`) | |
| `npm run build` (sous `env -i`), `typecheck`, `c0:check`, `c0:vendor-test`, `c0:test` | ✅ | `raw/build.txt`, `typecheck.txt`, `c0_check.txt`, `c0_vendor_test.txt` 4/4, `c0_ts_test.txt` 9/9 | |
| Tests BC2 sur la branche | ✅ | **50/50** (`raw/test_bc2_on_bc4_db.txt`) | rejoués sur `prodes_site_bc4_test`, **pas** via `npm run test:bc2` littéral (qui vise `prodes_site_bc2_test`, base de BC2 : aucune base partagée) ; même commande sinon |
| F-04 base et port de test configurables | ✅ | `package.json` (`SITE_TEST_DATABASE_URL`, `SITE_TEST_PORT`, défauts inchangés), `tests/bc4/http.e2e.mjs`, `raw/replay_gates.sh` | |
| F-01 / F-02 annexe poll corrigée (effets réels d'un rejeu, événement empoisonné) | ✅ | `docs/SITE_TRANSPORT_STAGING.md` annexe BC4 | comportement inchangé |
| Tests HTTP A2 sur la branche | ✅ | **81/81** (`raw/test_http_a2_port3351.txt`) | rejoués sur une copie temporaire où **seul** `PORT` 3341 → 3351 change (`raw/test_http_a2_port_diff.txt`), copie supprimée |
| Docs BC4 | ✅ | `docs/SITE_DB_SCHEMA.md` § BC4, `docs/SITE_TRANSPORT_STAGING.md` annexe poll/ACK | |
| Suite Factory complète / `check_skips` / `verify_source_manifest` / `non_oubli` | ⏸️ | non exécutés | lot Commerce seul : aucun fichier Factory ni `c0/` touché |
| Poll réel 48 h, volumétrie, secrets réels, HTTPS, anti-rejeu | ⏸️ | — | hors W1 (`DEFERRED_FOR_PROD`) |

Rejeu : `evidence/W1/BC4/raw/replay_gates.sh` (sorties dans `raw/`, résumé `raw/summary.txt`). Les compteurs ci-dessus
comptent des tests `node --test` ; ils ne mesurent ni la couverture de code, ni la charge, ni la durée réelle de polling.

## Fichiers

- Nouveaux : `db/migrations/010_site_idempotency.sql`, `011_site_quote.sql`, `012_site_order.sql`, `013_site_outbox_event.sql`,
  `014_site_event_cursor.sql`, `015_site_transaction_log.sql`, `016_site_idempotency_receipt_bytes.sql` ; `lib/site-transactions/{common,business,receipt,events,config,http}.ts` ;
  `app/api/site/receipt/route.ts`, `app/api/site/events/route.ts`, `app/api/site/events/ack/route.ts` ; `tests/bc4/*.test.mjs`
  (12 familles + `13_receipt_bytes`), `tests/bc4/helpers.mjs`, `tests/bc4/http.e2e.mjs` ; `tsconfig.bc4.json` ; `evidence/W1/BC4/**`.
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

10. **Reçu en octets canoniques stockés** (review F-03) : `receipt_bytes = canonicalBytes(reçu)`, recopiés tels quels (dernière clé
    `receipt` du corps, en-tête `x-site-receipt-sha256`) à la création, au rejeu et à la consultation.

## Dettes découvertes (candidates NON-OUBLI, rien de clos)

- Table HTTP indicative C0 §13 dupliquée entre `lib/site-business/validate.ts` (A2) et `lib/site-transactions/common.ts` (alias `@/`
  non résolu par le build `tsc` des tests) : à factoriser à l'intégration.
- **Anti-rejeu horodaté du poll / purge des curseurs** (review F-01) : une requête de poll signée (`{cursor, limit}`, sans horodatage
  ni nonce) est rejouable tant que la clé vit ; chaque rejeu re-sert les non-acquittés à son porteur, insère une ligne
  `site_event_cursor` (append-only, aucune purge) et incrémente `delivery_count` (ma 1re version disait à tort « sans autre effet »).
  `site_outbox_event` (ACKED) croît aussi sans purge. À porter au NON-OUBLI Factory ; acceptable en `STAGING_TRANSPORT` seulement.
- **Événement empoisonné** (review F-02) : le curseur n'avance pas, les non-acquittés sont re-servis en tête ; ≥ `limit` événements
  durablement refusés par la Factory bloquent le flux. Comportement inchangé, documenté dans l'annexe ; question propriétaire 5.
- Correction (review F-06) : ma 1re version affirmait que `lib/site-publish` (`activate`) n'écoutait pas les erreurs de connexion —
  **inexact** : `receiver.ts` enregistre bien un écouteur ; et BC2 a depuis corrigé `withTransaction` dans `lib/site-db/pool.ts` à
  `c5dc9d02` (non fusionné dans cette branche, partie de `a9dede14`).
- `PENDING_REVIEW` : admis par le schéma, aucune route ni règle (décision métier).

## Notes de la review indépendante (`review-bc4/evidence/W1/BC4/review/REVIEW_INDEPENDENT.md`)

| Note | Objet | Suite |
|---|---|---|
| F-05 | table HTTP §13 dupliquée (A2 / BC4), valeurs identiques | factoriser à l'intégration |
| F-07 | jeton du reçu dans l'URL (historique, `Referer`, proxys ; pas dans les journaux `next start`) | question 2 |
| F-08 | jeton non redonné au rejeu : une 1re réponse perdue (ou 503 après COMMIT réussi) prive le client de son reçu | question 6 |
| F-09 | devis non chiffré accepté sur une ACTIVE `UNSAFE` (conforme C0 §10.2), contrôles `ITEM_*` sur un snapshot altéré | candidat contrat v2 (C0 v1 non édité) |
| F-10 | `lock_timeout` BC4 5 s < activation BC2 possible (15 s) → commandes 503 `55P03` pendant une longue activation, rejeu sûr | documenté ; mesurer la durée réelle d'activation |
| F-11 | pages A2 sur `SITE_CATALOG_SOURCE=fixture` alors que BC4 juge l'ACTIVE en base → divergence prix affichés / jugés | intégration (`ActiveGenerationSource`, hors ownership BC4) |
| F-12 | ni `Content-Type` ni `Origin` contrôlés, pas de limitation de débit (pas de cookie : CSRF sans gain) | BC3 / intégration ; `DEFERRED_FOR_PROD` |
| F-13 | écart de temps médian faux jeton / réf inconnue ≈ 30–70 µs ; refs à 128 bits | aucune en W1 |
| F-14 | diff `c0/` depuis `a9dede14` = re-vente A2 (`156bc548`, `C0_VENDOR_OK`) ; `package.json`, `tsconfig.bc4.json`, `.gitignore` nécessaires | aucune |

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
5. **Événement empoisonné** (F-02) : un événement durablement refusé par la Factory bloque la tête du flux. Option (1) quarantaine
   explicite côté Factory par ACK d'`event_ids` ; option (2) statut SITE `REFUSED` posé par une route d'ACK-refus signée. Laquelle ?
6. **Jeton au rejeu** (F-08) : réémettre un jeton sur rejeu vérifié (même empreinte), ou accepter qu'un client ayant perdu la
   1re réponse n'ait plus accès à son reçu ?
