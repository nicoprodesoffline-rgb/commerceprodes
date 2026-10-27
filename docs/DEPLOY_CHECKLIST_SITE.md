# Check-list de déploiement SITE (receiver BC2, poll BC4, vitrine) — lot G W4

Statut : check-list **préparatoire** ; aucun déploiement SITE n'est autorisé par ce document (aucune exposition publique
du SITE sans GO propriétaire). À rejouer à chaque déploiement, résultat consigné avec SHA et date.

## 1. Frontal et routes machine (DF-0130)

- [ ] Aucun proxy applicatif ni frontal ne tamponne/plafonne le corps de `/api/site/publish/**` et `/api/site/events/**`
      en dessous de **32 MiB** (STAGE 32 MiB, média 20 MiB, contrôle 256 KiB : plafonds portés par les routes).
      Détail : `docs/SITE_TRANSPORT_STAGING.md`, § « Routes machine hors proxy ».
- [ ] Corps relayé en flux, sans réécriture, décompression ni cache ; `cache-control: no-store` préservé.
- [ ] `proxy.ts` : `matcher` exclut toujours `api/site/publish` et `api/site/events` ; `npm run test:storefront`
      (section 4, routes machine hors proxy) vert sur le SHA déployé.
- [ ] Recette de bout en bout : un STAGE de ~31 MiB et un média de ~20 MiB passent le frontal (413 seulement au-delà,
      corps JSON `BODY_TOO_LARGE` émis par la route, jamais une page HTML du frontal).

## 2. Configuration du receiver

- [ ] `SITE_ENV=production` (hors staging).
- [ ] `SITE_WITHDRAWAL_HOLD_POLICY.max_withdrawals_without_release` = **entier décidé par le propriétaire**
      (`REQUIRES_OWNER_DECISION`, DF-0090 ; aucune valeur par défaut). `null` hors staging : le serveur **refuse de
      démarrer** (`DÉMARRAGE REFUSÉ`, code 1) — vérifier au premier démarrage que ce message est absent du journal.
- [ ] `SITE_KEYRING_PATH` : trousseau de production hors Git, lisible par le seul compte du service ; aucune entrée
      `TEST_SECRET_NOT_FOR_PRODUCTION`. Isolation / Ed25519 : `REQUIRES_OWNER_DECISION` (Factory
      `docs/operations/SITE_ACK_SECRET_ISOLATION.md`, DF-0093).
- [ ] `SITE_ACK_KEY_ID` : clé `activation_ack` `ACTIVE`.
- [ ] `SITE_DATABASE_URL` : base dédiée ; jamais une base `prodes_site_*_test`.

## 3. Versions et dépendances

- [ ] Version Unicode du SITE relevée (`node -p process.versions.unicode` avec le binaire du service) et précondition
      producteur ≤ consommateur vérifiée (Factory `scripts/c0_unicode_precondition.py`,
      `docs/operations/UNICODE_PRECONDITION.md`, DF-0089). `UNKNOWN` = pas de publication réelle.
- [ ] `npm ls next` ≥ 16.4.2, `npm audit` sans avis critique (DF-0091).

## 4. Tests à rejouer sur le SHA déployé

- [ ] `npm run test:bc2` (base `prodes_site_*_test` jetable), dont `tests/bc2/18_startup_policy.test.mjs`.
- [ ] `npm run test:http`, `npm run test:storefront`.
- [ ] Factory : `manage.py site_fixture_publish` (fixtures `STAGING_FIXTURE`) contre un SITE de **staging** seulement.

## Ce que cette check-list ne couvre pas

HTTPS, limites de débit, anti-rejeu horodaté, rotation réelle des clés, sauvegarde/restauration de la base SITE.
