# C0 vendu dans Commerce — mécanisme et règles

Le contrat Factory ↔ SITE **C0 v1** (`site_snapshot.v1`, `site_activation.v1`, `site_business.v1`,
`site_events.v1`) a **une seule autorité** : le dépôt Factory `nicoprodesoffline-rgb/prodes-data-factory-poc`,
code gelé au commit `f1cf9e277bd090a4e7947b39f2e3dd700eea9e42` (`C0_FROZEN` v1, regel du 27/10/2026 : v1 de `b88f5cdf` + ajout `selectPriceIn` de l'arbitrage Owner A14, mêmes octets et verdicts). Le dossier `c0/` de
Commerce en est une **copie vendue, épinglée au SHA**, jamais un fork.

## Pourquoi ce mécanisme

- **Reproductible** : extraction par `git archive <sha>` (objets git, jamais le working tree d'un poste),
  chaque fichier vérifié contre son blob git, puis empreintes SHA-256 dans `c0/C0_SOURCE.json`.
- **Sans couplage d'exécution** : ni package npm, ni submodule, ni service ; Commerce compile et teste le
  jumeau TypeScript seul (`npm run c0:build`, `npm run c0:test` → 9/9) avec son TypeScript 5.9.3.
- **Anti-drift** : `npm run c0:check` recalcule les empreintes de `c0/` (hors `c0/ts/dist/`,
  `c0/ts/node_modules/` — chemins exacts, un `dist/` ailleurs est inspecté — et le manifeste) → `C0_VENDOR_OK`
  ou `C0_VENDOR_DRIFT` avec la liste `ADDED` / `MISSING` / `MODIFIED` / `UNSUPPORTED`.
  `tests/c0/vendor.test.mjs` (`npm run c0:vendor-test`, Node ≥ 22) le vérifie, y compris sur des drifts simulés.
- **Limite de `check.mjs`** : il prouve « `c0/` = manifeste », pas « manifeste = Factory » ; un manifeste réécrit
  de façon cohérente le passerait. Les valeurs du manifeste (`frozen_code_sha`, `archived_from_sha`,
  `tree_digest`, `file_count`, trees de `frozen_code_identity`) sont donc **épinglées** dans
  `tests/c0/vendor.test.mjs` (`PINNED`) ; seul un commit de re-sync revu les change. Pour une preuve contre Factory,
  rejouer `git archive` et `diff -r` (voir `evidence/W1/A1/raw/replay_gates.sh`). Répertoires vides, bit
  exécutable et lien symbolique à la racine `c0` ne sont pas vus par `check.mjs` (Git les montre).
- **Parité** : le registre `c0/ts/dist/verdicts.ts.json` produit ici doit être octet pour octet celui que
  produit Factory (`c0/ts` → `npm run build && npm test`).

Contenu vendu : `c0/README.md`, `c0/fixtures/`, `c0/ts/src/`, `c0/ts/test/` et la configuration de
compilation du jumeau (`c0/ts/package.json`, `c0/ts/tsconfig.json`, `c0/ts/package-lock.json`). Le Python et
les outils de génération restent côté Factory.

**Code gelé vs commit archivé.** `frozen_code_sha` (`f1cf9e27…`) est le code gelé ; `archived_from_sha` est le
commit Factory réellement archivé (actuellement `b69c41c7…`, candidat W5+W6, dont `c0/README.md` porte le statut
`C0_FROZEN` et le regel). `sync.mjs` refuse (`C0_FROZEN_CODE_MISMATCH`, avant toute écriture) si `c0/python`, `c0/ts/src`,
`c0/ts/test` ou `c0/fixtures` n'ont pas le même objet tree git aux deux SHA, ou si `c0/ts/package.json`,
`c0/ts/tsconfig.json`, `c0/ts/package-lock.json` n'ont pas le même blob ; les identifiants des quatre trees sont
consignés dans `frozen_code_identity` du manifeste (les trois blobs de configuration sont vérifiés mais pas
consignés, pour garder les octets du manifeste v1), et `check.mjs` échoue si cette attestation manque.
SHA inconnu, dépôt invalide ou argument incorrect : `C0_SYNC_FAILED <raison>`, exit 1, rien n'est écrit.

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
Sans `--frozen-sha`, `frozen_code_sha = --sha` : c'est une déclaration de l'opérateur, bornée par les valeurs
épinglées du test (à rendre obligatoire en v2). Commande de l'état actuel :
`npm run c0:sync -- --factory <Factory> --sha b69c41c7072bb0307d75d8ca15a415fd7ced6659 --frozen-sha f1cf9e277bd090a4e7947b39f2e3dd700eea9e42`.
Mettre ensuite à jour la constante attendue de `tests/c0/vendor.test.mjs` et `contract_version` dans
`scripts/c0/lib.mjs`, comparer les deux registres de verdicts (SHA-256), et livrer le tout dans un commit
dédié revu. Un SHA non gelé, une branche ou un working tree ne sont jamais des sources acceptables.

`tree_digest` = SHA-256 de la concaténation, triée par chemin (octets UTF-8), de `"<chemin>\t<sha256>\n"`.
