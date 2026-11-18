# C0 v2 — `site_snapshot.v2` et `site_content.v2` (cercle 3, lignes 3.1 et 3.2)

À côté du contrat gelé `c0/` (v1, inchangé). Contrat normatif : [`docs/contracts/c0_site_v2.md`](../docs/contracts/c0_site_v2.md).

```text
c0v2/
  python/c0_contracts_v2/   référence Python (importe les briques v1 de c0/python, en lecture)
  ts/                       jumeau TypeScript (importe c0/ts/src) et test de parité
  tools/generate_fixtures.py  jeux d'essai déterministes ; --check = reproductibilité
  fixtures/                 cas, documents (octets canoniques), médias, VERDICTS.json, EXPECTED_DIGESTS.json
```

## Lancer

```bash
.venv/bin/python c0v2/tools/generate_fixtures.py --check     # -> C0V2_FIXTURES_REPRODUCIBLE
.venv/bin/python c0/tools/generate_fixtures.py --check       # -> C0_FIXTURES_REPRODUCIBLE (v1 intacte)
manage.py test tests.contracts                               # Python, v1 et v2
cd c0v2/ts && npm ci && npm run build && npm test            # TypeScript, mêmes empreintes
```

Le SITE recopie `c0/ts/src` et `c0v2/ts/src` ; un récepteur conforme donne, sur tout `c0v2/fixtures/cases`, les verdicts de
`VERDICTS.json` et les empreintes de résultat de `EXPECTED_DIGESTS.json`. Tout est fictif (`STAGING_FIXTURE`).
