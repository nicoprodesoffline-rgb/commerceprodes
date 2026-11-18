# Réglages de vente publiés au site — `site_commerce.v1` (cercle 5, ligne 5.21)

> Écrit le 18/11/2026 par f1/EC. Suivi : issue #112. Compagnon de [`site_events_v2.md`](site_events_v2.md).

**Pourquoi un document à part** : l'objet `shop` du contenu `site_content.v2` est un contrat C0 gelé à ensemble de clés exact (`c0_site_v2.md` §2, règle V04) ; y ajouter le taux de TVA ou les textes de règlement le changerait. Les réglages de vente voyagent donc dans un document à part, posé à côté, avec son propre validateur. Le contenu v2 ne change pas.

## 1. Ce qui est réglé dans la Factory (SITE › Boutique)

| Réglage | Publié au site | Utilisé par |
|---|---|---|
| Taux de TVA (20 % à ce jour) | Oui | Panier, commande, reçu, accusé (5.5) |
| Option « Livraison sur rendez-vous » : libellé et montant HT (20 € HT à ce jour) | Oui | Commande (5.6) |
| Marche à suivre de chaque mode de règlement : chèque, virement, mandat administratif | Oui | Commande, reçu, accusé, bon de commande (5.13) |
| Mention d'information sous les formulaires, et sa version | Oui | Devis, commande, demande libre (5.8) |
| Version des conditions générales de vente | Oui | Case à cocher de la commande (5.14). Les pages CGV et Confidentialité sont des pages éditables comme les autres (contenu v2) |
| Textes de l'accusé au client (devis, commande, demande libre) : objet et corps | Oui | File de l'accusé du site (5.17) |
| Adresse d'expéditeur affichée | Oui | Accusé du site. L'accès au serveur d'envoi reste un réglage du serveur, jamais publié ni dans Git |
| Boîte de Prodes qui reçoit les demandes | **Non** | E-mail de la Factory à Prodes (5.18) |
| Textes de l'e-mail à Prodes | **Non** | Idem |

Tant que l'Owner n'a pas fourni les textes, ce sont des textes d'attente, écrits comme tels (« Texte d'attente : … »).

## 2. Document

```text
{ contract_version:"site_commerce.v1", publication_id, commerce_sequence:int>=1, generated_at_utc,
  tax_rate:"20.00",
  delivery_rendez_vous:{ label, amount_ht },
  payment:{ cheque:{label, instructions}, virement:{label, instructions}, mandat_administratif:{label, instructions} },
  privacy_notice:{ version, text },
  cgv_version,
  acknowledgement:{ quote:{subject, body}, order:{subject, body}, message:{subject, body} },
  sender:{ name, address } | null,
  payload_sha256 }
```

- Octets canoniques et lecture stricte du C0 (`c0_site_v1.md` §4) ; plafond 64 KiB ; ensemble de clés exact.
- `payload_sha256 = digest("prodes.site_commerce.v1", document sans payload_sha256)`.
- Montants et taux : chaînes décimales à deux chiffres (`"20.00"`).
- Textes : NFC, sans caractère de contrôle sauf `\n` dans `instructions`, `text` et `body` ; libellés ≤ 120, versions ≤ 40, objets ≤ 200, corps et marches à suivre ≤ 4 000.
- Les corps d'accusé peuvent contenir trois marques, remplacées par le site : `{numero}`, `{recapitulatif}`, `{lien_recu}`. Une autre marque entre accolades est refusée (`acknowledgement.placeholder`).
- `commerce_sequence` croît à chaque enregistrement des réglages.

## 3. Transport

- Même clé de publication que le contenu v2 (portée `site_snapshot.publish`), nouvelle route du site : `POST /api/site/commerce/activate`, HTTPS obligatoire hors boucle locale.
- Signature de la requête : les en-têtes du cercle 4 (`x-c0-key-id`, `x-c0-issued-at`, `x-c0-nonce`, `x-c0-request-signature`), la signature étant HMAC-SHA256 sur `utf8("prodes.site.transport.commerce_activate.v1") || 0x00 || canonical_bytes({method, path, body_sha256, issued_at_utc, nonce})`. Le document n'est pas signé en plus : son `payload_sha256` et la signature de la requête suffisent.
- Le site valide, garde le document, l'active et répond par un accusé `{contract_version:"site_commerce.v1", commerce_sequence, payload_sha256, activated_at_utc, signature}`, où `signature` = HMAC de la clé d'accusé du site sur `utf8("prodes.site.transport.commerce_ack.v1") || 0x00 || canonical_bytes(accusé sans signature)` ; la réponse reste signée comme au cercle 4. La Factory vérifie cet accusé avant d'afficher « reçus par le site ».
- Refus du site : `PAYLOAD_MALFORMED` (lecture stricte), `INTEGRITY_MISMATCH` (octets non canoniques ou `payload_sha256` faux), `SCHEMA_UNSUPPORTED` (autre `contract_version`), `DOCUMENT_INVALID` avec `detail.rules` (`unknown_key`, `missing_key`, `tax_rate_format`, `amount_format`, `text_length`, `acknowledgement.placeholder`…), `STALE_SEQUENCE` (séquence plus ancienne), `SEQUENCE_COLLISION` (même séquence, autre empreinte). Même séquence et même empreinte : rejeu, même accusé.
- Envoyé après chaque enregistrement des réglages et à chaque tour de la boucle de synchronisation tant que l'accusé n'est pas reçu, comme le contenu.
- Le site retient la `commerce_sequence` servie avec chaque panier : un panier ouvert sous un autre taux demande une nouvelle confirmation avant l'envoi (attendu M04).
- Un site qui n'a reçu aucun document `site_commerce.v1` ne prend ni devis ni commande en v2 : il le dit au client (« la boutique n'est pas prête »), au lieu de deviner un taux.

## 4. Jeu d'essai (`docs/contracts/site_commerce_v1/`)

Joué tel quel par la Factory (Python) et le site (TypeScript) : un document valide ; clé inconnue ; clé absente ; taux écrit en nombre ; marque inconnue dans un corps ; empreinte fausse ; octets non canoniques ; séquence plus ancienne.

## 5. Ce que ce contrat ne prouve pas

Les textes définitifs (règlement, mention, CGV, accusés) attendent l'Owner ; l'adresse d'expéditeur attend la décision B3 du 19/11.
