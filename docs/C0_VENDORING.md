# C0 vendu dans Commerce — mécanisme et règles

Le contrat Factory ↔ SITE **C0 v1** (`site_snapshot.v1`, `site_activation.v1`, `site_business.v1`,
`site_events.v1`) a **une seule autorité** : le dépôt Factory `nicoprodesoffline-rgb/prodes-data-factory-poc`,
code gelé au commit `b88f5cdf2ca64eca8de4d19c077262e11f9e7e54` (`C0_FROZEN` v1). Le dossier `c0/` de
Commerce en est une **copie vendue, épinglée au SHA**, jamais un fork.

## Pourquoi ce mécanisme

- **Reproductible** : extraction par `git archive <sha>` (objets git, jamais le working tree d'un poste),
  chaque fichier vérifié contre son blob git, puis empreintes SHA-256 dans `c0/C0_SOURCE.json`.
- **Sans couplage d'exécution** : ni package npm, ni submodule, ni service ; Commerce compile et teste le
  jumeau TypeScript seul (`npm run c0:build`, `npm run c0:test` → 9/9) avec son TypeScript 5.9.3.
- **Anti-drift** : `npm run c0:check` recalcule les empreintes de `c0/` (hors `dist/`, `node_modules/`
  et le manifeste) → `C0_VENDOR_OK` ou `C0_VENDOR_DRIFT` avec la liste `ADDED` / `MISSING` / `MODIFIED`.
  `tests/c0/vendor.test.mjs` (`npm run c0:vendor-test`) le vérifie, y compris sur un drift simulé.
- **Parité** : le registre `c0/ts/dist/verdicts.ts.json` produit ici doit être octet pour octet celui que
  produit Factory (`c0/ts` → `npm run build && npm test`).

Contenu vendu : `c0/README.md`, `c0/fixtures/`, `c0/ts/src/`, `c0/ts/test/` et la configuration de
compilation du jumeau (`c0/ts/package.json`, `c0/ts/tsconfig.json`, `c0/ts/package-lock.json`). Le Python et
les outils de génération restent côté Factory.

**Code gelé vs commit archivé.** `frozen_code_sha` (`b88f5cdf…`) est le code gelé ; `archived_from_sha` est le
commit Factory réellement archivé (actuellement `7a5ac012…`, tête de PR #29, dont `c0/README.md` porte le statut
`C0_FROZEN`). `sync.mjs` refuse (`C0_FROZEN_CODE_MISMATCH`, avant toute écriture) si `c0/python`, `c0/ts/src`,
`c0/ts/test` ou `c0/fixtures` n'ont pas le même objet tree git aux deux SHA ; les identifiants de ces trees sont
consignés dans `frozen_code_identity` du manifeste, et `check.mjs` échoue si cette attestation manque.

## Interdit

**Ne jamais éditer `c0/` à la main**, même pour « une petite adaptation » : toute modification d'un octet
fait échouer `c0:check`. Un défaut du contrat se signale côté Factory (rapport + proposition de **v2**),
jamais par un correctif local.

## Resynchroniser — uniquement sur une nouvelle version gelée

Seulement quand Factory a prononcé le gel d'une nouvelle version (v2, nouveau SHA de code gelé) :

```bash
npm run c0:sync -- --factory <chemin du dépôt Factory> --sha <sha archivé> --frozen-sha <sha complet du code gelé v2>
npm run c0:check && npm run c0:build && npm run c0:test && npm run c0:vendor-test
```

`c0:sync` **remplace entièrement** `c0/` (aucune fusion) et réécrit `c0/C0_SOURCE.json`
(`frozen_code_sha`, `archived_from_sha`, `frozen_code_identity`, `files`, `tree_digest`). `--sha` peut être un
commit postérieur au gel (docs seulement) : le code doit y être identique au `--frozen-sha`, sinon refus.
Sans `--frozen-sha`, `frozen_code_sha = --sha`. Commande de l'état actuel :
`npm run c0:sync -- --factory <Factory> --sha 7a5ac0120d808c2f08d3be7d6f935eb8388afba8 --frozen-sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54`.
Mettre ensuite à jour la constante attendue de `tests/c0/vendor.test.mjs` et `contract_version` dans
`scripts/c0/lib.mjs`, comparer les deux registres de verdicts (SHA-256), et livrer le tout dans un commit
dédié revu. Un SHA non gelé, une branche ou un working tree ne sont jamais des sources acceptables.

`tree_digest` = SHA-256 de la concaténation, triée par chemin (octets UTF-8), de `"<chemin>\t<sha256>\n"`.
