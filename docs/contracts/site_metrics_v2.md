# Statistiques du site — product_metrics_daily.v2 (CA-9, PR 1)

Autorité du contrat Factory/site. La v1 (`future_seams_v1.md` §5) et son registre restent lisibles et inchangés.
Aucun événement brut, visiteur, identifiant de session ni donnée personnelle ne remonte.

## Lot et ligne

Le lot contient **exactement** `contract_version`, `up_to`, `rows` :

```json
{"contract_version":"product_metrics_daily.v2","up_to":"2026-11-26","rows":[{"date":"2026-11-25","public_item_key":"PI-00TT9T81N","views":7,"add_to_cart":2,"quote_start":1,"quote_submit":0}]}
```

Exemple entièrement inventé. `rows` est une liste, éventuellement vide, de **5 000 lignes au plus**.
Chaque ligne contient exactement `date`, `public_item_key`, `views`, `add_to_cart`, `quote_start`, `quote_submit`.
Les quatre compteurs sont des entiers ≥ 0 : booléens, flottants et textes sont refusés. Tout autre membre est refusé,
notamment `impressions`, `clicks`, `session`, `visitor` et `item_id`.

`date`, `up_to` et le paramètre `depuis` sont des dates calendaires strictes `YYYY-MM-DD`.
Les jours sont ceux de **Europe/Paris**, changements d'heure compris. `date` ≤ `up_to` et `up_to` < aujourd'hui à Paris.
Lorsque `depuis` est demandé, chaque ligne a `date` ≥ `depuis` (inclusif). Le lot est trié par `date`, puis
`public_item_key` (ordre lexical croissant), avec une seule ligne par paire `(date, public_item_key)`.

`public_item_key` est `Item.public_key` du catalogue C0 v2, jamais le UUID interne. Une clé reprise par
`inherit_public_key` est résolue vers son porteur actuel hors historique, en une requête pour tout le lot.
Une seule clé inconnue refuse tout le lot.

## Route et signatures

La Factory lit `GET /api/site/metrics?depuis=YYYY-MM-DD`, corps vide. Le site n'appelle pas la Factory.
La portée `site_metrics.read` appartient au trousseau des routes des demandes (`PRODES_SITE_REQUESTS_KEYRING_PATH`),
**à part de la liste fermée des portées C0**. Une unique clé ACTIVE de cette portée, secret d'au moins 32 octets UTF-8,
est nécessaire lors de la lecture des statistiques ; l'absence de cette clé ne bloque pas les autres pas du tour.

Même transport que `integrations/site_requests_client.py` : adresse locale de boucle, ou HTTPS distant avec certificat
vérifié ; aucun proxy, aucune redirection ; délai borné. La réponse est bornée à **1 Mio = 1 048 576 octets**
(lecture de 1 octet supplémentaire pour détecter le dépassement).

La requête porte `x-c0-key-id`, `x-c0-issued-at` (UTC), `x-c0-nonce` frais et `x-c0-request-signature` :

```text
HMAC-SHA256(secret_utf8,
  utf8("prodes.site.transport.metrics_read.v1") || 0x00 || canonical_bytes({
    method: "GET",
    path: "/api/site/metrics?depuis=YYYY-MM-DD",
    body_sha256: sha256(b""),
    issued_at_utc: issued_at,
    nonce: nonce
  }))
```

La signature couvre le chemin **avec sa query**. La réponse DOIT porter `x-c0-response-key-id` et
`x-c0-response-signature`, valides avec la clé d'accusé `activation_ack` de la liaison du cercle 4.
Le domaine `prodes.c0.transport.response.v1` et le contexte de réponse sont ceux de `projections.site_link.sign_response` : nonce de la requête,
statut HTTP et empreinte SHA-256 des octets exacts de la réponse. Une réponse non signée ou mal signée est refusée :
rien n'est enregistré et le curseur ne change pas.
Une **404, signée ou non**, donne l'état `NOT_YET` (« le site ne donne pas encore ses statistiques »), sans erreur ; son
corps n'a pas à être JSON. Un site d'avant les statistiques n'a pas la route et ne peut pas signer sa 404 ; une 404 ne
porte aucun compteur, rien n'entre et le curseur ne change pas. Un statut 200 signé porte le lot décrit ci-dessus.

## Registre, interrupteur et curseur

Les fichiers v2 sont sous `PRODES_DATA_ROOT/seams/analytics/product_metrics_daily_v2/<item_uuid>/<date>.json` :
un fichier complet ou absent par (Item, jour), avec les **quatre** compteurs. Ceux de v1 ne sont ni lus ni réécrits par v2.
La validation et le contrôle des conflits portent sur tout le lot avant toute écriture : mêmes valeurs = rien écrit,
autres valeurs d'un jour enregistré = `METRICS_CONFLICT`, rien du lot n'entre. Comme en v1, les fichiers sont créés
atomiquement et un lot interrompu par une panne disque se termine par rejeu ; le curseur n'avance pas en cas de panne.

Le curseur réutilise `integrations.SiteEventCursor`, dans une source distincte `metrics.v2:<site_url>#<key_id>` ;
`cursor` garde le dernier `up_to` enregistré. Prochain `depuis` = ce jour + 1 ; premier appel = aujourd'hui à Paris − 30 jours.
Le verrou de ligne sérialise les tours d'une même source. Le curseur est sauvé **après** l'enregistrement réussi,
y compris pour un lot vide, et ne recule jamais. Une 404, un refus ou un échec ne l'avance pas.

« Statistiques du site », dans Administration / Réglages / Traitements, est **à l'arrêt par défaut** (aucun changement
n'est créé par la migration). À l'arrêt, aucun appel statistiques au site. À la marche, le pas `statistics` du tour
`site_requests_cycle.run_turn` relève les jours clos ; son échec n'arrête aucun autre pas. Le chef d'orchestre dispose
aussi du tour indépendant `site_metrics_poll` (rythme horaire), avec le même interrupteur et le même curseur.

## Codes

Une validation refusée rend la liste des problèmes. L'enregistrement lève `METRICS_INVALID` avec `problem_codes` ;
un conflit du registre lève directement `METRICS_CONFLICT`. Le pas du tour et `site_metrics_poll` les rendent en refus nommé
(`REFUSED` avec ce code), jamais en exception ; rien n'entre et le curseur ne bouge pas.

| Code | Motif |
|---|---|
| `METRICS_NOT_AN_OBJECT` | Lot non objet |
| `KEY_MISSING` | Membre obligatoire absent (enveloppe ou date/clé d'une ligne) |
| `KEY_UNKNOWN` | Membre non prévu, enveloppe ou ligne |
| `CONTRACT_VERSION_UNSUPPORTED` | Version différente de v2 |
| `ROWS_INVALID` | `rows` n'est pas une liste |
| `ROWS_TOO_MANY` | Plus de 5 000 lignes |
| `ROW_INVALID` | Ligne non objet |
| `DATE_INVALID` | Date non calendaire ou format non strict, dont `depuis` |
| `DAY_NOT_CLOSED` | `up_to` est aujourd'hui ou plus tard, à Paris |
| `DATE_OUT_OF_RANGE` | Ligne après `up_to` ou avant `depuis` |
| `METRIC_MISSING` | Un des quatre compteurs manque |
| `METRIC_INVALID` | Compteur négatif, booléen, flottant ou texte |
| `ITEM_UNKNOWN` | Clé absente du catalogue courant ou de type invalide |
| `ROWS_UNSORTED` | Tri date puis clé non respecté |
| `ROW_DUPLICATE` | Paire date/clé présente plusieurs fois |
| `METRICS_INVALID` | Refus global de validation à l'enregistrement |
| `METRICS_CONFLICT` | Autres valeurs pour un produit et un jour déjà enregistrés |
| `NOT_YET` | Réponse 404, signée ou non ; état sans erreur |
| `RESPONSE_UNRECOGNISED` | Signature de réponse absente ou invalide |
| `TRANSPORT_REFUSED` | Redirection ou réponse au-delà de 1 Mio |
| `RESPONSE_NOT_JSON` | Réponse autre que 404 non objet JSON |
| `HTTP_<statut>` | Autre refus HTTP signé |
| `UNREACHABLE:<type>` | Transport indisponible |

## Limites et jeux partagés

Une vue se rattache au produit affiché à l'ouverture de la fiche. Un **rechargement compte une vue de plus**.
Les **robots sans exécution du script ne sont pas comptés** ; ceux exécutant le script peuvent l'être.
La Factory voit les jours clos, donc **la veille au plus tôt**, sans temps réel. Un total de famille est la somme de ses
produits, pas un nombre de visiteurs uniques. Ces compteurs ne mesurent ni des personnes ni des sessions.

Les documents inventés et l'oracle déclaré sont dans `tests/fixtures/seams/product_metrics_daily_v2/VERDICTS.json`.
Chaque cas repart d'un registre vide ; les lots d'un cas se jouent dans l'ordre, avec le résolveur et l'heure fixés du manifeste.
Le générateur standard Python ne dépend ni de Django ni d'une base :

```sh
python tests/fixtures/seams/product_metrics_daily_v2/generate_fixtures.py --check
```
