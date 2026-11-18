# Événements du site avec coordonnées — `site_events.v2` (cercle 5, paquet A)

> Écrit le 18/11/2026 par f1/EC sur le GO de code de l'Owner (« Code du cercle 5 : GO, sans l'envoi réel des e-mails ni le CRM »).
> Lignes : 5.1 à 5.4, 5.22 à 5.25 du [détail](../roadmap/cercles/CERCLE_5_VENDRE_SANS_PAIEMENT.md). Attendus : [jeu d'attendus](../roadmap/cercles/CERCLE_5_JEU_ATTENDUS.md). Suivi : issue #112.

**Ce contrat se pose à côté de `site_events.v1`, jamais à sa place.** Le C0 gelé (`c0_site_v1.md` §11, §13) ne change pas : un événement v1 reste lu et validé par `c0_contracts.events.validate_event` comme aujourd'hui. Le v2 a son propre validateur, en Python dans la Factory et en TypeScript dans le site, et un seul jeu d'essai, joué tel quel par les deux (`docs/contracts/site_events_v2/`).

## 1. Ce qui change par rapport au v1

| Sujet | v1 | v2 |
|---|---|---|
| Coordonnées, message, adresses | Interdites | Portées par l'événement (décision B4 de l'Owner : la Factory garde les demandes) |
| Types | `quote.requested`, `order.received` | Les mêmes, plus `message.received` (formulaire « Nous écrire », décision B6) |
| Montants | HT seulement | HT, TVA et TTC, option de livraison |
| Numéro lisible | Aucun | `DEV-2026-000123`, `CMD-2026-000123`, `MSG-2026-000123` |
| Transport de lecture | `http://` en boucle locale | HTTPS obligatoire vers une adresse distante ; `http://` seulement en boucle locale (attendu D02) |
| Refus durable | Reste en tête du flux (DF-0116) | Mis de côté des deux côtés après trois refus (§6) |
| Routes de la Factory vers le site | Lecture et ACK | Plus : effacement des coordonnées, dépôt d'un PDF, mise de côté (§5) |

Le site n'émet plus d'événement v1 pour une demande qu'il émet en v2 (attendu D01). Un site resté en v1 continue d'être lu ; la Factory affiche alors la demande « sans coordonnées » (attendu D03).

## 2. Enveloppe

Mêmes dix clés, même lecture stricte et mêmes octets canoniques que le v1 (`c0_site_v1.md` §4) :

```text
{ contract_version:"site_events.v2", event_id, event_type:"quote.requested"|"order.received"|"message.received",
  event_version:1, created_at_utc, object_ref, idempotency_key, catalogue_sequence:int|null,
  payload, payload_digest }
```

- `payload_digest = digest("prodes.site_events.v2.payload", payload)` (même fonction `digest` que `c0_site_v1.md` §5, autre domaine).
- `object_ref` reste l'identifiant technique du site (référence longue) ; le numéro lisible est dans `payload.number`.
- `idempotency_key = "<event_type>:<object_ref>"`.
- Plafond : 256 KiB, comme le v1.
- Ordre de validation : celui du v1 (§11.2), avec `contract_version = "site_events.v2"` ; la déduplication contre `consumed` est identique (`EVENT_DUPLICATE_NOOP`, `EVENT_IDEMPOTENCY_CONFLICT`).
- Codes de refus : ceux du v1 (`PAYLOAD_MALFORMED`, `INTEGRITY_MISMATCH`, `SCHEMA_UNSUPPORTED`, `EVENT_PAYLOAD_INVALID`, `EVENT_TYPE_UNKNOWN`, `DUPLICATE_LINE`, `EVENT_IDEMPOTENCY_CONFLICT`). Un refus `EVENT_PAYLOAD_INVALID` porte `detail.rules`, la liste des règles nommées ci-dessous qui ont échoué.

## 3. Payload

Tous les textes sont des chaînes NFC sans caractère de contrôle (sauf `\n` dans `message`), bornées en longueur ; une clé inconnue est refusée (`unknown_key`). Les montants sont des chaînes décimales à deux chiffres après la virgule (`"120.00"`), jamais des nombres, comme au v1.

### 3.1 Blocs communs

| Bloc | Forme | Règles nommées |
|---|---|---|
| `number` | `^(DEV|CMD|MSG)-\d{4}-\d{6}$`, préfixe selon le type (`DEV` devis, `CMD` commande, `MSG` demande libre) | `number_format`, `number_prefix` |
| `contact` | `{organisation: texte ≤ 200 | null, name: texte 1…120, email: texte 3…254 avec un seul « @ » et au moins un point après lui, phone: texte ≤ 40 | null}` | `contact_required`, `contact_email` |
| `message` | texte ≤ 5 000, ou `null` | `message_length` |
| `privacy_notice` | version de la mention d'information affichée sous le formulaire, texte 1…40 | `privacy_notice_required` |

### 3.2 Lignes et montants (`quote.requested`, `order.received`)

```text
lines: [{ public_item_key, variant_axes, item_label, quantity,
          rate_id|null, unit_amount_ht|null, line_total_ht|null, line_tva|null,
          lot: {bought:int>=1, free:int>=1} | null }]
delivery: { option: "incluse"|"rendez_vous", label, amount_ht, amount_tva }
amounts: { currency:"EUR", tax_rate:"20.00", total_ht, total_tva, total_ttc, excludes_quote_lines: bool }
```

- `item_label` : nom du produit tel qu'affiché au client, texte 1…200 ; il sert au PDF et aux e-mails, sans lecture du catalogue (un événement est un fait).
- `lot` : un lot avec unités offertes, écrit « 10 achetés + 2 offerts » sur la ligne, du panier jusqu'au PDF ; `quantity` compte des lots et le prix reste celui du lot (ligne 5.7, attendu M07).
- Une ligne « prix sur devis » a `rate_id`, `unit_amount_ht`, `line_total_ht` et `line_tva` à `null` ; elle n'est permise que dans un devis (`quote_line_in_order`, attendu M09), et `excludes_quote_lines` vaut alors `true` (attendu M08).
- Une ligne par `(public_item_key, variant_axes)` : doublon → `DUPLICATE_LINE`.
- `delivery` : `incluse` vaut `0.00` ; `rendez_vous` porte le montant réglé dans la boutique (20 € HT à ce jour). C'est une ligne de montant à part, nommée par `label` (attendu M03). Un devis peut la porter ; une demande libre n'en a pas.
- **Calcul**, que le site fait et que la Factory refait à la réception :
  - `line_total_ht = quantity × unit_amount_ht` ;
  - `line_tva = arrondi(line_total_ht × tax_rate / 100)` au centime, **demi au-dessus** (0,005 → 0,01), ligne par ligne ;
  - TVA de la livraison calculée de même sur `amount_ht` ;
  - `total_ht` = somme des lignes chiffrées + livraison ; `total_tva` = somme des TVA ; `total_ttc = total_ht + total_tva`.
  Exemples : attendus M01 à M03.
- **Le validateur ne refuse pas un total faux** : il vérifie la forme (`amount_format`). Des totaux que la Factory recalcule différemment ne bloquent pas la réception : la demande est gardée et marquée « montants à vérifier », et aucun e-mail ne part sans un clic (attendu M06). Le site, lui, refuse un montant falsifié par le navigateur avant d'émettre, comme aujourd'hui (attendu M05).

### 3.3 Par type

| Type | Payload | Règles nommées |
|---|---|---|
| `quote.requested` | `{number, contact, message, privacy_notice, lines (≥ 1), delivery, amounts}` | `lines_required` |
| `order.received` | les clés du devis, plus `status:"RECEIVED"`, `addresses`, `customer_refs`, `payment`, `terms` ; toutes les lignes chiffrées | `quote_line_in_order`, `address_required`, `siret_format`, `payment_method`, `terms_required` |
| `message.received` | `{number, contact, message (1…5 000, obligatoire), privacy_notice, product}` | `message_required` |

- `addresses` : `{delivery: ADRESSE, billing: ADRESSE | null}` ; `billing = null` veut dire « comme la livraison » (attendu C02). `ADRESSE = {name: texte 1…120, line1: texte 1…200, line2: texte ≤ 200 | null, postal_code: texte 1…10, city: texte 1…100, country: "FR"}`.
- `customer_refs` : `{siret: 14 chiffres | null, order_number: texte ≤ 60 | null, service_code: texte ≤ 60 | null}` ; `order_number` porte le numéro de bon de commande ou d'engagement (ligne 5.12).
- `payment` : `{method: "cheque"|"virement"|"mandat_administratif", instructions: texte 1…2 000}`. `instructions` est la marche à suivre réglée dans la boutique **au moment de la commande** : les PDF et e-mails la reprennent telle quelle, et un changement ultérieur dans la boutique ne la modifie pas (attendu C08). Aucun texte ne dit « payé » : une commande est « enregistrée ».
- `terms` : `{cgv_version: texte 1…40, accepted: true}` (ligne 5.14, attendu C06).
- `product` (demande libre) : `{public_item_key | null, label: texte 1…200, url: chemin du site commençant par « / »}` ou `null` (attendu Q05).

## 4. Ce que fait la Factory à la réception (`integrations`, `site_requests`)

- Le poll lit les deux versions sur le même flux : `contract_version` choisit le validateur. Un v2 lu sans HTTPS vers une adresse qui n'est pas une boucle locale est refusé avant toute requête (attendu D02).
- Un événement v2 accepté crée **une** « Demande du site » (devis, commande ou demande libre) avec ses lignes et ses coordonnées ; un événement re-servi n'en crée pas une seconde (attendu D04). Le garde de test « aucun modèle client, devis ou commande » est levé pour ce seul objet, nommément (décision B4).
- Aucun calcul métier ni changement d'état commercial : la Factory recalcule les montants pour les vérifier (§3.2), fabrique les PDF, prépare l'e-mail à Prodes et consigne. Les états visibles sont ceux des envois.
- **Conservation** : coordonnées, adresses, message et références du client sont gardés trois ans après la réception, puis effacés par une commande planifiable ; les lignes, montants et numéros restent (décision B5).
- **Effacement à la demande** (ligne 5.4) : immédiat dans la Factory, PDF compris ; l'ordre part au site au tour de boucle suivant (§5.1) ; la fiche affiche « coordonnées effacées le … » ; la trace ne contient aucune donnée personnelle (attendu D07).
- **Protection** (ligne 5.24) : aucune coordonnée dans les journaux ni dans les traces d'erreur (on journalise `event_id` et `number`, jamais le payload) ; les coordonnées sont dans la sauvegarde de la Factory et son manifeste le dit ; l'écran et les PDF exigent le droit « demandes » (attendu P07).

## 5. Routes de la Factory vers le site

Toutes signées comme le poll v1 (horodatage et nonce neufs à chaque essai, domaine propre à chaque route), HTTPS obligatoire hors boucle locale, une portée de clé par route. Le site n'appelle jamais la Factory.

| Route | Portée | Corps | Effet sur le site |
|---|---|---|---|
| 5.1 `POST /api/site/requests/erase` | `site_requests.erase` | `{object_ref}` | Efface coordonnées, adresses, message, références du client et PDF de la demande ; les déclencheurs de la base autorisent **ce seul** effacement (attendu D08 inchangé pour le reste). Idempotente : `{erased_at}` |
| 5.2 `POST /api/site/requests/document` | `site_requests.documents` | `{object_ref, kind:"demande_de_devis"|"bon_de_commande", sha256, pdf_base64}`, ≤ 2 MiB | Range le PDF de la Factory ; le reçu le propose une fois la demande transmise |
| 5.3 `POST /api/site/events/set-aside` | `site_events.set_aside` | `{event_id, code}` | Sort l'événement du flux non acquitté et le marque « mis de côté », visible ; les suivants passent |

Domaines de signature : `prodes.site.transport.requests_erase.v1`, `prodes.site.transport.requests_document.v1`, `prodes.site.transport.events_set_aside.v1`.

## 6. Ce que fait le site

- **Émission** : une demande enregistrée émet un seul événement v2 dans la même transaction que la demande (outbox, comme le v1).
- **Reçu** (ligne 5.22) : deux états, « reçue » puis « transmise à notre équipe » quand la Factory a acquitté l'événement (attendus P01, P02) ; le code du reçu voyage dans le corps de la requête, jamais dans l'adresse (attendu P03) ; le lien privé est aussi dans l'accusé.
- **Conservation** (ligne 5.3) : trente jours après l'acquittement, coordonnées, adresses, message, références du client et PDF sont effacés ; le reçu, les lignes, les montants et le numéro restent (attendu D05). Une demande jamais acquittée n'est pas effacée (attendu D06).
- **Mise de côté** (ligne 5.25) : la Factory compte les refus d'un même contenu ; au troisième, elle appelle §5.3 et garde la demande en quarantaine à son écran (attendu P06).
- **Accusé au client** (ligne 5.17, décision B2 : il part du site) : voir §7.
- **Anti-abus** (ligne 5.23) : limite de débit par adresse sur devis, commande, demande libre et reçu (le sixième envoi en une minute reçoit « trop de demandes, réessayez dans une minute », attendu P04) ; champ piège invisible : réponse d'apparence normale, rien d'enregistré, rien d'émis (attendu Q04).

## 7. E-mails : mode « gardés » seul actif

- **Qui envoie quoi** :
  - l'accusé au client part du site (B2) ;
  - l'e-mail complet à la boîte de Prodes part de la Factory (B1), coordonnées et PDF compris, réponse dirigée vers le client.
- **Le PDF de l'accusé** (choix f1, demandé par le mandat §3) : le site envoie l'accusé tout de suite, **sans pièce jointe**. Il contient le numéro, le récapitulatif et le lien privé vers le reçu. La Factory fabrique le PDF et le dépose sur le site (§5.2) ; le reçu le propose dès que la demande est transmise. Pourquoi : l'accusé n'attend pas la Factory, le site ne fabrique aucun PDF et ne garde aucun accès à la Factory.
- **File d'envoi** des deux côtés :
  - un envoi par message, jamais deux ;
  - états « à envoyer », « envoyé », « refusé », « sans réponse » ;
  - nouvelles tentatives à 1, 5 et 30 minutes, puis toutes les heures pendant 48 h (attendus T03, T04).
- **Mode « gardés »** : le message est fabriqué, rangé et lisible à l'écran, et **rien ne sort**. C'est le seul mode actif livré dans ce mandat, et un test le prouve de chaque côté : aucune connexion réseau n'est ouverte.
- **Protocole SMTP standard**, sans fournisseur nommé dans le code (B3 sera décidé le 19/11) :
  - dans la Factory, le protocole SMTP de Django, sans librairie nouvelle ;
  - les accès d'envoi sont des réglages du serveur, jamais une valeur dans Git.

## 8. Jeu d'essai commun (`docs/contracts/site_events_v2/`)

Un fichier par cas, joué tel quel par le validateur Python et par le validateur TypeScript. Chaque cas donne les octets, `consumed` et le verdict attendu (`APPLY`, `DUPLICATE_NOOP` ou le code de refus, avec `detail.rules`). Les valeurs sont inventées (« Mairie de Val-Fictif », `achats@val-fictif.example`). Cas minimaux :

| Cas | Verdict |
|---|---|
| `quote_requested`, `order_received`, `message_received` valides | `APPLY` |
| `quote_with_quote_line` (ligne « prix sur devis », `excludes_quote_lines: true`) | `APPLY` |
| `order_with_lot` (« 10 achetés + 2 offerts ») et `order_rendez_vous` (M03) | `APPLY` |
| `order_amounts_differ` (totaux faux mais bien écrits) | `APPLY` (la Factory marque « montants à vérifier ») |
| `replay_same_content` | `DUPLICATE_NOOP` |
| `same_key_other_content` | `EVENT_IDEMPOTENCY_CONFLICT` |
| `non_canonical_bytes` | `INTEGRITY_MISMATCH` |
| `digest_v1_domain` (empreinte calculée avec le domaine du v1) | `INTEGRITY_MISMATCH` |
| `unknown_key`, `contact_missing`, `email_without_at`, `siret_13_digits`, `payment_method_unknown`, `terms_missing`, `quote_line_in_order`, `message_empty`, `number_wrong_prefix`, `amount_as_number` | `EVENT_PAYLOAD_INVALID` avec la règle nommée |
| `order_duplicate_lines` | `DUPLICATE_LINE` |
| `event_type_unknown` | `EVENT_TYPE_UNKNOWN` |
| `v1_envelope_to_v2_validator` | `SCHEMA_UNSUPPORTED` |

## 9. Ce que ce contrat ne prouve pas

- Aucun e-mail réel : le choix du service (B3), l'adresse d'expéditeur et les réglages du domaine sont au paquet B.
- L'envoi au CRM de l'éditeur (ligne 5.20) reste « non branché » (paquet C).
- Les durées de conservation sont la décision B5 de l'Owner, pas un avis de droit.
- La concordance Python et TypeScript ne vaut que pour les cas du jeu d'essai.
