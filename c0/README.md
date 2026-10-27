# C0 — contrats Factory ↔ SITE, deux implémentations et golden fixtures

Statut : `C0_FROZEN` v1 (2026-10-23, code `b88f5cdf`, review indépendante `FREEZE_RECOMMENDED`) / `TESTED_SYNTHETIC`.
**Regel du 2026-10-27 (fusion officielle W5+W6, GO Owner, issue #43)** : code gelé de référence = `f1cf9e277bd090a4e7947b39f2e3dd700eea9e42`.
Seul écart avec `b88f5cdf` : l'ajout ciblé `selectPriceIn` dans `c0/ts/src/business.ts` (Owner A14), même calcul ; `c0/python`,
`c0/ts/test` et `c0/fixtures` sont identiques (mêmes objets tree), versions de contrat inchangées (`site_*.v1`), parité 249 cas.
Contrat normatif : [`docs/contracts/c0_site_v1.md`](../docs/contracts/c0_site_v1.md) et
[`docs/contracts/c0_public_identity_v1.md`](../docs/contracts/c0_public_identity_v1.md).

## Structure

```text
c0/
  python/c0_contracts/   fonctions pures Python (stdlib + catalog.domain.canonical_json)
  ts/src/                jumeau TypeScript strict (seule dépendance : typescript, dev)
  ts/test/               tests node --test sur le JS compilé
  tools/generate_fixtures.py   génère c0/fixtures/ de façon déterministe (--check = reproductibilité)
  tools/c0_fixture_lib.py      briques de génération (PNG réels, snapshots, trousseau de test)
  tools/compare_verdicts.py    compare les registres Python/TS -> C0_PARITY_OK
  fixtures/
    cases/<SCÉNARIO>/*.json    un cas = une fonction + ses entrées ($doc / $bytes / $media)
    documents/<SCÉNARIO>/*.json  snapshots, requêtes, événements, ACK, manifestes (dont octets invalides) ;
                               snapshot_* et event_* = octets canoniques exacts (C0 §4), sauf refus voulus
    media/                     vrais PNG (et un SVG pour les refus de type)
    keys/test_keyring.json     secrets TEST_SECRET_NOT_FOR_PRODUCTION uniquement
    identity_vectors.json      vecteurs de clés publiques (valides / invalides)
    VERDICTS.json              oracle déclaré à la main : {accepted, outcome, error_codes, notes, expect}
    EXPECTED_DIGESTS.json      calculé : SHA médias, SHA octets canoniques des documents, SHA des résultats
```

Toutes les données sont synthétiques et étiquetées `STAGING_FIXTURE` : aucun fournisseur réel, aucun BUY,
aucune marge, aucun `price_public`.

## Lancer

Depuis la racine du dépôt :

```bash
# 1. Python (aucune base requise : SimpleTestCase ; écrit evidence/WAVE0/BC0/raw/verdicts.py.json)
PRODES_DB_HOST=localhost PRODES_DB_PORT=54318 PRODES_DB_NAME=prodes_factory \
PRODES_DB_USER=prodes_factory PRODES_DB_PASSWORD=local-dev-only \
  .venv/bin/python manage.py test tests.contracts

# 2. TypeScript (Node 22 ; écrit c0/ts/dist/verdicts.ts.json)
cd c0/ts && npm ci && npm run build && npm test && cd ../..

# 3. Parité des deux registres
.venv/bin/python c0/tools/compare_verdicts.py        # -> C0_PARITY_OK

# Régénérer les fixtures (après modification volontaire du contrat) / vérifier la reproductibilité
.venv/bin/python c0/tools/generate_fixtures.py
.venv/bin/python c0/tools/generate_fixtures.py --check   # -> C0_FIXTURES_REPRODUCIBLE
```

Le générateur exécute l'implémentation Python sur chaque cas et **s'arrête** si un verdict diffère de la
déclaration ; les deux suites vérifient ensuite verdicts, octets canoniques et SHA des résultats.

## Utiliser depuis BC2–BC5

- Python : `sys.path` vers `c0/python`, puis `from c0_contracts import evaluate_publication, select_price, ...`.
- TypeScript : copier ou référencer `c0/ts/src` (aucune dépendance runtime ; `node:crypto` seulement).
- Un consommateur conforme doit donner, sur tout `c0/fixtures/cases`, les verdicts de `VERDICTS.json`.
