# Contrats Factory ↔ SITE, version 2 (cercle 3, lignes 3.1 et 3.2)

Écrit le 17/11/2026 (lot V, issue #112). Ajouté **à côté** du contrat gelé [`c0_site_v1.md`](c0_site_v1.md), qui reste la référence de
tout ce que ce document ne change pas : lecture stricte et octets canoniques (§4), digests (§5), formats (§6), signature et clés (§7),
étapes et codes (§8.2, §13). Rien n'est modifié sous `c0/` : la v1 se lit et s'active comme avant.

| Où | Quoi |
|---|---|
| `c0v2/python/c0_contracts_v2/` | Référence Python : `snapshot.py` (catalogue v2), `activation.py` (récepteur v1 + v2), `content.py` (contenus v2), `errors.py`, `runner.py` |
| `c0v2/ts/` | Jumeau TypeScript, mêmes noms de règles, même ordre ; le SITE le recopie comme il recopie `c0/ts/src` |
| `c0v2/fixtures/` | Jeux d'essai : cas, documents (octets canoniques), médias, `VERDICTS.json` (déclaré à la main), `EXPECTED_DIGESTS.json` (calculé) |
| `c0v2/tools/generate_fixtures.py` | Régénère les jeux d'essai ; `--check` prouve qu'ils sont reproductibles |

Parité (attendu V02) : la suite Python (`tests/contracts/test_c0v2_parity.py`) et la suite TypeScript (`c0v2/ts/test`) comparent chaque
résultat au **même** `EXPECTED_DIGESTS.json` ; mêmes octets, même empreinte des deux côtés.

## 1. Versions

| Document | Version | Clé de signature | Domaine de signature | Accusé |
|---|---|---|---|---|
| Catalogue | `site_snapshot.v2` | celle de la v1 (portée `site_snapshot.publish`) | `prodes.c0.sig.site_snapshot.v2` | `site_activation.v1`, inchangé |
| Contenus | `site_content.v2` | la même | `prodes.c0.sig.site_content.v2` | `site_content_activation.v2` (portée `activation_ack`) |

Domaines de hachage : `prodes.c0.site_snapshot.v2`, `prodes.c0.basis.v2`, `prodes.c0.site_content.v2`, `prodes.c0.active_content.v2`.
Les domaines séparent les versions : une signature v1 ne couvre jamais un document v2, une signature de catalogue ne couvre jamais des
contenus (cas `v2_signed_under_the_v1_domain`, `content_signed_under_the_catalogue_domain`). Aucune clé nouvelle sur le poste.

Un SITE qui lit la v2 lit aussi la v1 : un document `site_snapshot.v1` passe par le récepteur v1 gelé (V03). Un SITE resté en v1
refuse un document v2 à l'étape `version`, code `SCHEMA_UNSUPPORTED`, sans changer le catalogue servi (V05). Le premier catalogue v2
prend une génération v1 active comme base (séquence, empreinte, retraits expliqués), cas `v2_after_a_v1_active`.

## 2. `site_snapshot.v2`

Même enveloppe, même couverture, même registre d'identité, mêmes comptes qu'en v1. **Chaque champ ajouté est présent dans chaque
document** (ensemble de clés exact) : `null` ou liste vide tant que sa ligne attend une réponse de l'Owner ; une clé absente ou inconnue
est un refus `SNAPSHOT_INVALID` avec sa règle (V04). **Une seule exception** (EC, 26/11) : `family.own_range` peut manquer, et absent
vaut `false` (cas `v2_own_range_absent_reads_false`). La Factory l'envoie toujours.

| Objet | Champ ajouté | Format | Règle (`detail.rules`) | Ligne |
|---|---|---|---|---|
| Rubrique | `position` | entier 1 … 1 000 000 (ordre parmi les rubriques sœurs) | `category.position` | 3.22 |
| Rubrique | `intro_text` | texte ≤ 5 000, lignes admises, ou `null` | `category.intro_text` | 3.22 |
| Rubrique | `image_sha256` | empreinte d'un média déclaré, ou `null` | `category.image_sha256` ; inconnue → `MEDIA_MISSING` | 3.22 |
| Rubrique | `seo_title`, `seo_description` | texte ≤ 200 / ≤ 1 000, ou `null` | `category.seo_title`, `category.seo_description` | 3.13 |
| Rubrique | `hidden` | booléen (masquée du menu et du plan du site, pas retirée) | `category.hidden` | 3.22 |
| Famille | `seo_title`, `seo_description` | texte ≤ 200 / ≤ 1 000, ou `null` (le SITE prend alors le nom) | `family.seo_title`, `family.seo_description` | 3.13 |
| Famille | `slug_aliases` | anciennes adresses, triées, uniques ; aucune n'est l'adresse ou l'alias d'une autre famille | `family.slug_aliases`, `family.slug_aliases_order`, `families.slug_unique` | 3.18 |
| Famille | `first_published_at_utc` | instant UTC de la **première arrivée sur le SITE** (décision Owner du 17/11, N01–N03) : retenu par la Factory à l'accusé d'activation, jamais changé ensuite, même après une dépublication ; une famille qui n'est jamais arrivée porte l'instant du document qui la publie | `family.first_published_at_utc` | 3.20 |
| Famille | `category_positions` | `[{category_key, position}]`, triée, seulement dans les rubriques de la famille ; liste vide = ordre par défaut du SITE | `family.category_positions` | 3.21 |
| Famille | `characteristics` | `[{label ≤ 100, value ≤ 500}]`, ≤ 200, libellés uniques, ordre de la Factory | `family.characteristics`, `family.characteristics_unique` | 3.14 |
| Famille | `delivery_delay` | texte ≤ 120, ou `null` : le délai de livraison du fournisseur de la famille, tel que saisi dans la Factory (écran « Délais de livraison ») ; `null` quand il n'y en a pas UN seul (aucun saisi, un pack, ou des fournisseurs aux délais différents), jamais une valeur par défaut ; le SITE n'affiche rien pour `null` | `family.delivery_delay` | 49e série (25/11) |
| Famille | `own_range` | `true` ou `false`. La Factory le donne toujours ; **absent, il vaut `false`**, et `null` ou un texte sont refusés. Ainsi un SITE déjà à jour accepte les catalogues d'une Factory d'avant CA-5, et un retour arrière de la Factory seule ne casse rien. Le SITE doit donc être mis à jour **avant la Factory, ou en même temps** : un SITE d'avant cette règle refuse un catalogue qui porte la clé. La famille est de la **gamme propre de Prodes** selon le réglage de l'écran « Relations de catalogue » (son fournisseur, ou son mot dans le nom de la famille ou la désignation d'un de ses produits). Jamais le réglage lui-même : ni le fournisseur, ni le mot. Changer le réglage republie le catalogue | `family.own_range` | CA-5 (Owner A.4-d1, 24/11) |
| Famille | `documents` | `[{label, kind: TECHNICAL_SHEET\|NOTICE\|OTHER, sha256, mime: application/pdf, size ≤ 30 Mio}]`, triée par empreinte | `family.documents`, `family.documents_order` | 3.15 |
| Variante | `pack` | `{paid_units, free_units}` (entiers ≥ 1) ou `null` | `item.pack` | 3.20 |
| Variante | `characteristics` | comme la famille : ce qui diffère d'une variante à l'autre | `item.characteristics`, `item.characteristics_unique` | 3.14 |
| Fenêtre de prix | `price_nature` | `BASE`, `PROMOTION`, `URGENCE` ou `null` | `window.price_nature` | 3.20 |
| Fenêtre de prix | `reference_unit_amount` | montant > 0 sur toute nature de fenêtre : le **prix barré fourni par le fichier du Calculateur** (lot à prix fixe d'abord, M02), sinon `null` ; la Factory n'en calcule jamais | `window.reference_unit_amount` | 3.20 |
| Média | `derivatives` | `[{sha256, width, height, mime, size}]`, ≤ 8, largeurs strictement croissantes, empreintes uniques et distinctes des médias | `media.derivatives`, `media.derivatives_order`, `media.derivatives_unique` | 3.3 |
| Média | `alt` | texte ≤ 150, ou `null` | `media.alt` | 3.4 |
| Média | `public_name` | nom lisible de l'adresse `/media/<empreinte>/<nom>.webp` (format d'une adresse), ou `null` ; l'empreinte seule fait foi | `media.public_name` | 3.4 |

**Médias (§8.5 v1 étendu).** Une entrée **avec** dérivés est une image dont le SITE sert les dérivés : son `sha256` reste son identité
(c'est lui que nomment familles, variantes et rubriques), l'original reste dans la Factory et son `mime` peut être n'importe quel type
d'image (TIFF, GIF…, 30 Mio au plus) ; chaque dérivé est en PNG, JPEG ou WebP (`MEDIA_TYPE_REJECTED` sinon). Une entrée **sans** dérivé est
servie comme en v1 (PNG, JPEG ou WebP, 20 Mio au plus). À l'étape `media`, le SITE vérifie les octets qu'il sert
(`served_media`) : les dérivés d'une image dérivée, l'image elle-même sinon, et chaque document PDF (signature `%PDF-`). L'original
d'une image dérivée n'est jamais exigé (cas `v2_accepted`).

**Ordre des contrôles de forme**, identique dans les deux langages : dans chaque objet, l'ensemble exact des clés, puis les champs v1
dans l'ordre v1, puis les champs v2 dans l'ordre du tableau ci-dessus. Les règles sémantiques v1 gardent leur nom ; les adresses
`slug_aliases` entrent dans l'espace des adresses (`families.slug_unique`) ; l'image d'une rubrique compte comme utilisée
(`media_refs.orphan`).

## 3. Récepteur v1 + v2 (`activation.py`)

Mêmes entrées et même résultat que `evaluate_publication` v1 (`stage`, `ack`, `detail`). Mêmes douze étapes pour un document v2, avec
les règles v2 et l'étape `media` du §2 ; identité, couverture, retenue et sûreté sont les fonctions v1 (elles ne lisent que des clés
v1). L'accusé est `build_ack` v1 : la Factory le vérifie avec `verify_ack` v1, sans changement (cas `v2_ack_verified_by_v1`). La
preuve de couverture avant envoi est `check_source_coverage` sur la validation v2, avec le même manifeste privé.

### 3.1 Fonctions métier (`site_business.v1`) sur un catalogue v2

Les fonctions métier v1 (`select_price`, `validate_quote_request`, `validate_order_submit`, `lookup_receipt`) sont gelées et exigent un
`site_snapshot.v1` bien formé. Sur un SITE qui sert un catalogue v2, elles reçoivent sa **vue v1** (`business.v1_view`, `v1View` en
TypeScript) : même enveloppe, rubriques, familles, variantes et fenêtres réduites à leurs clés v1, sans médias (aucune fonction métier
ne lit un média). Mêmes prix, mêmes codes, mêmes résultats ; un catalogue v1 passe tel quel. Le SITE appelle `c0v2` (`business.ts` :
`selectPrice`, `generationOf` + `selectPriceIn`, `validateQuoteRequest`, `validateOrderSubmit`), jamais la v1 sur un document v2.

### 3.2 Promotions, lots et caractéristiques lus par le SITE (3.14, 3.20 ; décisions de l'Owner du 17/11)

- **Famille en promotion** (pastille, univers `/promotions`, entrée de menu ; M01, M04–M07) : une de ses variantes a, à l'instant
  servi, une fenêtre `price_nature = PROMOTION` **ou** une fenêtre qui porte un `reference_unit_amount` (lot à prix fixe avec prix barré
  du Calculateur, M02 : F4 est en promotion sur une fenêtre `BASE`). Une fenêtre est en cours si `valid_from_utc ≤ instant` et
  (`valid_until_utc` nul ou `instant < valid_until_utc`). `valid_until_utc` ne s'affiche jamais au public (M05).
- **Prix barré** : `reference_unit_amount`, fourni par le fichier du Calculateur, jamais calculé ; économie = `reference_unit_amount −
  unit_amount` ; absent, rien n'est barré (M03).
- **Lot** : `item.pack = {paid_units, free_units}` pour « N achetés + M offerts » d'un seul produit ; `null` pour tout autre article.
- **Caractéristiques** (C01–C03) : pour la recherche seulement, jamais en tableau sur la fiche ; `label` et `value` s'affichent
  toujours échappés. Ce que les variantes publiées partagent est sur la famille, le reste sur la variante. La Factory n'en transmet
  aucune qui nomme ou cite un fournisseur, une marque, une référence, une norme, une garantie ou un prix (règle C03, garde éditoriale) ;
  une caractéristique écartée ne bloque jamais la famille.

### 3.3 Ordre des familles dans une rubrique (cercle A, CA-5 ; Owner A.4-d1 et A.4-d2, 24/11 ; GO d'EC du 26/11)

Le SITE range les familles d'une page de rubrique **au moment de l'affichage**, à l'instant servi : une promotion qui commence ou une
nouveauté qui expire change l'ordre sans attendre un nouvel envoi. Cet ordre est celui de la page par défaut (« Pertinence »). Les tris
que le visiteur choisit (prix, nom), l'ordre de la recherche et celui des univers « Promotions » et « Nouveautés » ne changent pas.

1. **Quatre groupes, dans cet ordre** ; une famille est dans le premier groupe auquel elle appartient :
   1. la **gamme propre** : `family.own_range = true` (§2) ;
   2. les **promotions** : la famille est en promotion à l'instant servi (§3.2) ;
   3. les **nouveautés** : la famille est une nouveauté à l'instant servi, selon la règle de `shop.novelty_days` et `shop.novelty_count`
      (§4, la même que l'univers « Nouveautés ») ;
   4. **le reste**.
2. **Dans chaque groupe** : d'abord les familles rangées à la main dans cette rubrique, par leur `position` (`category_positions`), puis
   les autres. Les nouveautés sans place viennent de la plus récente à la plus ancienne (`first_published_at_utc`). Les autres familles
   sans place viennent par leur nom (ordre alphabétique français, sans tenir compte des accents ni des majuscules). Dernier départage :
   `public_family_key`.
3. **Une famille qui n'est plus une nouveauté** quitte la tête. Elle reprend sa place dans son groupe : sa place à la main, ou sa place
   alphabétique, jamais le bas de la liste par principe.

*En attente de la réponse de l'Owner sur le rangement à la main (CA-5, question 1)* : le point 2, où le rangement à la main ne joue qu'à
l'intérieur d'un groupe, est la recommandation de l'équipe. L'autre choix serait que le rangement à la main l'emporte sur les groupes.
*En attente aussi (question 2)* : le point 3, où l'ancienne nouveauté reprend sa place au lieu de descendre tout en bas.

## 4. `site_content.v2`

Un seul document porte tout ce que le SITE sert hors du catalogue ; il remplace le dossier partagé `site_content.v1` (V08) et passe par
le même canal que le catalogue : envoi, vérification, activation, accusé signé.

```text
{ contract_version:"site_content.v2", publication_id, content_sequence:int>=1, generated_at_utc, catalogue_sequence:int|null,
  shop:{ phone|null, email|null, address|null, opening_hours|null, delivery_note|null, footer_links:[{label, path}],
         novelty_days:1..365, novelty_count:1..200 },  (nouveautés N04 : au plus novelty_count familles arrivées depuis novelty_days jours ; départ 60 et 24)
  announcement:{ text, link|null, starts_at_utc, ends_at_utc|null } | null,
  maintenance:{ active, message|null },            (active ⇒ message)
  redirects:[{ from_path, to_path, status: 301|308 }],
  pages:[{ key, slug, title, revision, seo_title|null, seo_description|null, canonical|null,
           sections:[{type, data, starts_at_utc?, ends_at_utc?}],     (CA-4 : dates facultatives d'un bloc, de tout type)
           nav:{ show_in_bar, order } }],
  relations:[{ source, target, kind: COMPLEMENTAIRE|LIE|UPSELL, order }],
  payload_sha256 }
```

### 4.1 Sections

Les quatre types v1 gardent leurs clés (une clé absente = non donnée), plus :

| Type | Clés de `data` (obligatoires en gras) | Ligne |
|---|---|---|
| `hero` | **`title`**, `text`, `link`, `link_label`, `image_sha256` (bandeau choisi, média du catalogue servi) | 3.24 |
| `category_grid` | `title`, **`categories`** (1 à 24 clés de rubrique du catalogue servi) | v1 |
| `product_carousel` | `title`, **`families`** (1 à 24 clés de famille du catalogue servi) | v1 |
| `text_image` | `title`, **`text`**, **`media_sha`**, `image_alt` (`""` = image décorative) | v1 |
| `faq` | `title`, **`questions`** : 1 à 100 `{question ≤ 300, answer ≤ 5 000}` | 3.24 |
| `rich_text` | `title`, **`text`** (≤ 20 000, lignes admises) | 3.24 |
| `selection` | `title`, **`source`** (`promotions`, `novelties`, `category`, `supplier`, `own_range`), **`families`** (la réserve : 1 à 200 clés de famille du catalogue servi, dans l'ordre des rubriques), **`shown`** (1 à 24), **`rotation`** (`fixed`, `daily`) | CA-4 |

**Bloc « selection » (cercle A, CA-4 ; Owner, 76e série, #130 7201854418 ; GO d'EC du 26/11).**
- La Factory résout la source en réserve à chaque envoi du contenu. Les promotions sont le prix barré venu du Calculateur, et rien d'autre (cercle 3).
- Le SITE ne connaît ni les fournisseurs ni le réglage de la gamme propre : `source` dit seulement d'où vient la réserve. Depuis CA-5, il reçoit dans le catalogue un oui ou un non par famille (`family.own_range`, §2), pour l'ordre des rubriques (§3.3), jamais le fournisseur ni le mot qui en décident.
- Une réserve vide n'est jamais envoyée (A.3-d1 : la Factory affiche « un bloc de l'accueil à compléter »). Le SITE refuse un bloc vide (`section.families`).
- La borne de 24 familles montrées est technique et commune aux deux côtés. Elle figure dans « Pas sur la page » des réglages.

**Ce que le SITE dessine** (`select_block`, même résultat en Python et en TypeScript) :
- **Le jour** est celui de Paris (`paris_day`), selon la règle européenne écrite sans base de fuseaux : UTC+2 du dernier dimanche de mars à 01:00 UTC jusqu'au dernier dimanche d'octobre à 01:00 UTC (exclu), UTC+1 sinon. Un bloc change donc à minuit à Paris, jamais à 1 h du matin.
- **Une réserve de Y ≤ X familles** est montrée entière, dans son ordre, sans tourner. Sinon, `fixed` montre les X premières. `daily` montre X familles à la suite à partir de la (n × X) mod Y-ième, en boucle, n étant le nombre de jours depuis le 1970-01-01. Sur Y jours, chaque famille est montrée autant de fois que les autres.
- **Les dates d'un bloc** : il est montré de `starts_at_utc` (inclus) à `ends_at_utc` (exclu), sans nouvel envoi. Un bloc hors de ses dates n'est pas dessiné.

### 4.2 Étapes et codes

`parse` (`PAYLOAD_MALFORMED`, plafond 8 Mio) → `canonical` (`INTEGRITY_MISMATCH`) → `version` (`SCHEMA_UNSUPPORTED`) → `shape`
(`CONTENT_INVALID`, la première règle) → `semantic` (`CONTENT_INVALID` avec ses règles ; `REFERENCE_MISSING` pour une rubrique, une famille
ou une image absente du catalogue servi) → `integrity` (`INTEGRITY_MISMATCH`) → `signature` (`SIGNATURE_INVALID`) → `sequence`
(`STALE_SEQUENCE`, `SEQUENCE_COLLISION`, ou l'accusé stocké rejoué `REPLAY_ACK`) → `ACTIVATED` et accusé. Un refus laisse servis les
contenus précédents (V09). `CONTENT_INVALID`, `REFERENCE_MISSING` et `PREVIEW_EXPIRED` (§4.5) sont les codes ajoutés (`c0v2/python/c0_contracts_v2/errors.py`).

Règles sémantiques : `redirects.order` (triées par `from_path`, uniques), `redirects.self`, `redirects.chain` (une cible n'est jamais
elle-même redirigée : un seul saut, S07), `redirects.page` (une page publiée n'est jamais redirigée), `pages.order` (triées par adresse,
uniques), `pages.key_unique`, `relations.order` (triées par source, type, ordre, cible ; ordres consécutifs à partir de 1),
`relations.pair` (pas de paire répétée, pas de famille liée à elle-même).

Accusé : `{contract_version:"site_content_activation.v2", outcome:"ACTIVATED", publication_id, content_sequence, payload_sha256,
active_digest, activated_at_utc, key_id, signature}` ; la Factory le vérifie avec `content.verify_ack` avant d'afficher « reçue par le
SITE ».

### 4.3 Adresses internes (ligne 3.31)

Un lien de page, un lien du pied de page, le lien du bandeau, une ancienne adresse et une cible de redirection sont des adresses
**internes au SITE** : elles commencent par `/`, jamais par `//` ni `/\`, sans schéma (`:` refusé), sans espace ni caractère de
contrôle, 500 caractères au plus ; une requête est admise (`/recherche?q=banc`, cible recommandée pour les étiquettes, Q-B3). Toute
autre cible est refusée `CONTENT_INVALID` (cas `redirect_to_another_host`, `redirect_with_a_scheme`).

Les réglages sont du texte : un réglage qui contient du HTML est accepté comme texte, et le SITE l'échappe à l'affichage (E03, cas
`content_html_in_a_setting`).

### 4.4 Transport (staging, comme `docs/SITE_TRANSPORT_STAGING.md` du catalogue)

Hors contrat au sens du §15 v1 : seuls octets, digests et signatures sont figés. Proposition retenue pour le cercle 3 :

| Document | Routes | En-têtes |
|---|---|---|
| Catalogue v2 | celles de la v1 : `POST stage` → `PUT media/{sha256}` pour **chaque octet servi** (`served_media`, pas `media_refs`) → `POST verify-media` → `POST activate` | `x-c0-key-id`, `x-c0-signature` = `sign_publication` **v2** (domaine `prodes.c0.sig.site_snapshot.v2`) |
| Contenus v2 | un seul appel `POST /api/site/content/activate`, corps = octets canoniques du document | `x-c0-key-id`, `x-c0-signature` = `sign_content` |

Réponse aux contenus : `200` avec `x-c0-outcome: ACTIVATED` ou `REPLAY_ACK` et l'accusé en corps ; refus `4xx` avec
`{accepted:false, outcome, error_codes, detail}`. Le SITE garde les contenus actifs et leur accusé ; un refus laisse servis les précédents.

### 4.5 Aperçu d'une page brouillon (`site_content_preview.v2`, ligne 3.26, B14)

Une seule page, jamais activée, jamais acquittée : le SITE la rend pour l'opérateur avant publication.

```text
{ contract_version:"site_content_preview.v2", page:<une page de site_content.v2>, generated_at_utc, expires_at_utc, payload_sha256 }
```

Hachage `prodes.c0.site_content_preview.v2` ; signature de la clé de publication, domaine `prodes.c0.sig.site_content_preview.v2`, contexte
`{generated_at_utc, payload_sha256}`. Étapes : `parse`, `canonical`, `version`, `shape` (`CONTENT_INVALID`, règles de la page), `semantic`
(`REFERENCE_MISSING` contre le catalogue servi), `integrity`, `signature`, `expiry` : `PREVIEW_EXPIRED` si `expires_at_utc` est passé
ou à plus de 30 minutes de l'horloge du SITE (le SITE ne garde jamais un aperçu plus longtemps). Résultat accepté : `PREVIEW_VALID`, avec
`page` et `expires_at_utc`.

Transport : `POST /api/site/content/preview`, corps = octets canoniques, en-têtes `x-c0-key-id`, `x-c0-signature` = `sign_preview` ;
réponse `200 {accepted:true, outcome:"PREVIEW_STORED", path:"/apercu/<preview_id>", expires_at_utc}`, le jeton tiré au hasard par le SITE
(le document n'en porte pas) ; refus `4xx` comme les contenus. La page d'aperçu est `noindex`, `no-store`, et répond 404 après expiration.

## 5. Jeux d'essai

67 cas, 42 documents, 8 médias ; tout est fictif et étiqueté `STAGING_FIXTURE` ; le catalogue est celui des attendus du cercle 3
(rubriques Bancs avec F1 à F3, Tables avec F4 et F5, Corbeilles vide). Les WebP sont des octets fixes écrits une fois avec Pillow ; les
originaux JPEG et TIFF ne sont décrits que par leur type, leur taille et leur empreinte, puisqu'ils ne quittent pas la Factory.

| Scénario | Ce qu'il prouve |
|---|---|
| `V2_CATALOGUE` | V01 (v2 activé, dérivés et document servis, originaux absents), rejeu, accusé vérifié par la v1, couverture prouvée, V04 (clé inconnue, clé v2 absente), V05 (SITE resté en v1), domaines séparés, dérivé ou document manquant, règles v2 ; CA-5 : `own_range` vrai sur F3, refusé s'il n'est ni vrai ni faux (texte ou `null`), accepté et lu faux s'il est absent |
| `V2_COEXISTENCE` | V03 (v1 lu par un SITE v2) et premier v2 sur une base v1 |
| `V2_BUSINESS` | §3.1 : prix d'une variante sur un catalogue v2 (fenêtre de base, promotion à partir de 10) et sur un catalogue v1 |
| `V2_PREVIEW` | B14 : aperçu accepté, expiré, gardé plus de 30 minutes, référence absente |
| `V2_CONTENT` | V07–V09 (activé, accusé vérifié, rejeu, séquence ancienne, référence absente), 3.31 (redirection vers un autre hôte ou avec un schéma), S07 (un seul saut), E03, maintenance sans message, clé inconnue ; CA-4 : blocs d'accueil acceptés, source, nombre montré (0, 25), rotation, réserve vide ou absente du catalogue, dates d'un bloc |
| `V2_BLOCKS` | CA-4 : ce que le SITE dessine d'un bloc. Jour de Paris (avant le jour UTC, les deux changements d'heure), rotation quotidienne et retour au début, `fixed`, réserve plus petite que le nombre montré, bloc caché avant son début et dès sa fin |

## 6. Ce que ce contrat ne prouve pas

Qu'un SITE réel affiche ces champs (lot V côté SITE, lots B, I, R) ; que la Factory remplisse les champs des lignes en attente de l'Owner
(3.14, 3.15, 3.20 : présents, vides) ; la qualité visuelle des dérivés (lot I, I18). Les plafonds (≤ 200 caractéristiques, ≤ 50 documents,
≤ 20 000 redirections) sont des bornes de lecture stricte, pas des mesures.
Le jour de Paris des blocs d'accueil (CA-4, `paris_day`) repose sur la règle européenne d'aujourd'hui (passage à l'heure d'été le dernier
dimanche de mars, retour le dernier dimanche d'octobre, à 01:00 UTC), écrite dans le code des deux côtés sans base de fuseaux : si la
règle change, il faut la changer dans la Factory et sur le site, avec les jeux d'essai `V2_BLOCKS` (relecture de 8f, PR #222).
