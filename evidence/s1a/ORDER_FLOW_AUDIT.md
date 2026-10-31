# Audit panier → devis → commande de test

Audit initial du 31 octobre 2026, branche `s1a/vitrine`. Lecture du code uniquement : aucun serveur, navigateur, réseau ou PostgreSQL lancé. Les mentions « existe » décrivent le code, pas une recette exécutée. Données des tests : fixtures synthétiques C0 exclusivement. Le tableau initial cite les fichiers à la révision de départ `57210fc3` (consultables par `git show 57210fc3:<fichier>`), avant les corrections ; les preuves finales ci-dessous citent le worktree courant.

| Étape | Existe ? | Preuve (fichier:ligne) | Manque |
| --- | --- | --- | --- |
| 1. Ajout depuis la fiche | Oui, lecture | `components/product/family-buy-box.tsx:112`, `components/cart/cart-provider.tsx:123` | Revalidation avant ajout, identité variante et tiroir présents. Clavier réel non vérifié. Fiche hors périmètre de modification. |
| 2. Panier | Oui, lecture | `components/cart/cart-view.tsx:16`, `components/cart/cart-summary.tsx:48`, `components/cart/use-cart-preview.ts:25` | Quantités, retrait, total serveur et blocage par génération présents. Annonce du total après modification à renforcer. |
| 3. Devis | Partiel | `components/checkout/checkout-flow.tsx:21`, `components/checkout/contact-fields.tsx:24`, `components/checkout/result-panel.tsx:19` | Coordonnées, message, envoi, référence et lien présents ; code pas affiché séparément, date/lignes enregistrées absentes du résultat immédiat. |
| 4. Commande de test | Partiel | `components/checkout/checkout-flow.tsx:155`, `app/commande/page.tsx:13` | Confirmation explicite présente ; texte de test exigé absent, vocabulaire laissant penser à une commande opérationnelle. |
| 5. Consultation du reçu | Partiel | `components/checkout/receipt-lookup.tsx:35`, `components/checkout/receipt-lookup.tsx:135` | Référence, date, lignes, total enregistré et bases présents. Focus après consultation absent ; champs vides non contrôlés ; texte de test absent. |
| 6a. Catalogue indisponible / réseau | Oui, lecture | `components/cart/cart-summary.tsx:168`, `components/checkout/result-panel.tsx:110`, `components/site/api.ts:8` | 503 et réseau traités, panier conservé. Réponses réellement reçues non vérifiées. |
| 6b. Catalogue/prix changés | Partiel | `components/checkout/checkout-flow.tsx:93`, `components/checkout/submit.ts:56`, `components/cart/cart-summary.tsx:152` | Nouvelle génération bloquée ; refus de prix dans la même génération rafraîchit sans imposer une vérification explicite au devis. |
| 6c. Ligne sans prix | Oui, lecture | `components/cart/use-cart-preview.ts:64`, `components/checkout/checkout-flow.tsx:56` | Commande bloquée, devis possible uniquement pour `PRICE_WINDOW_UNAVAILABLE`. Recette réelle non vérifiée. |
| 6d. Idempotence | Partiel | `components/checkout/submit.ts:23` | Clé réutilisée en mémoire uniquement : perdue au rechargement ; envois concurrents non verrouillés. |
| 7. Accessibilité | Partiel | `components/checkout/contact-fields.tsx:72`, `components/checkout/checkout-flow.tsx:38`, `components/checkout/result-panel.tsx:17`, `components/cart/cart-drawer.tsx:58` | Étiquettes, erreurs reliées, résumé focalisé, résultat focalisé, dialog natif présents. Consultation sans focus ni erreurs de saisie reliées ; état d’envoi absent de la région live. Lecteur d’écran et parcours clavier non vérifiés. |
| 8. Largeur 390 px | Non vérifié | `components/cart/cart-summary.tsx:93`, `components/checkout/receipt-lookup.tsx:144`, `components/checkout/result-panel.tsx:30` | Grille mobile et tableau à défilement local présents. Longue référence de reçu sans coupure : risque de débordement ; aucune mesure navigateur autorisée ici. |

## Choix de correction

Conserver les composants et le contrat C0. Partager le rendu des données enregistrées entre résultat et consultation, ajouter le texte exact de commande de test, relier les erreurs et focaliser la consultation. Conserver seulement empreinte SHA-256 du contenu et clé d’idempotence en `sessionStorage` (aucune coordonnée ni code d’accès) pour le rejeu dans le même onglet ; verrouiller les envois concurrents. Un refus de prix impose une nouvelle vérification explicite même à génération identique.

Le harnais `tests/nav/nav-server.mjs` utilise une source fixture sans persistance : insuffisant pour prouver un enregistrement. Le test à écrire reprend le démarrage `next start` de `tests/http/storefront.test.mjs`, active les fixtures avec les helpers BC2 existants et emploie BC4 sur PostgreSQL. Aucun changement serveur nécessaire.

## Limites connues

- C0 remet le code d’accès une seule fois. Si la réponse initiale est perdue, le rejeu retrouve la référence et les lignes mais ne peut pas restituer le code. Aucune récupération inventée côté interface.
- Le devis C0 ne contient pas de total enregistré : afficher cette absence, sans calcul navigateur.
- Stockage de session refusé : idempotence en mémoire seulement, limite au rechargement.
- Aucun build, test navigateur/HTTP ni accès base exécuté ici, sur consigne. Aucune CI définie dans ce dépôt public ; aucune CI créée ni déclenchée.
- Les modifications préexistantes hors périmètre sont conservées. Journal agents non exécuté : écriture hors racines autorisées du sandbox.


## Réconciliation après corrections

| Item prévu | Statut (✅ vérifié / ⚠️ partiel / ⏸️ différé) | Preuve (commande ou fichier) | Caveat |
| --- | --- | --- | --- |
| Audit initial, dans l’ordre demandé | ✅ vérifié | Présent document, tableau ci-dessus | Lecture statique ; ne vaut pas une recette visuelle. |
| Commande explicitement de test avant envoi et dans les reçus | ⚠️ partiel | `components/checkout/receipt-details.tsx:6`, `components/checkout/checkout-flow.tsx:117`, `app/commande/page.tsx:13` ; test `tests/e2e/order-flow.ui.mjs:236` | Texte implémenté et typé ; affichage navigateur non vérifié. |
| Référence, code séparé, date, lignes et total enregistré | ⚠️ partiel | `components/checkout/result-panel.tsx:28`, `components/checkout/result-panel.tsx:36`, `components/checkout/receipt-details.tsx:12` ; assertions `tests/e2e/order-flow.ui.mjs:146` | Devis sans total : absence explicitée. Code disponible à la création seulement (contrat gelé). |
| Retrouver un reçu par référence + code | ⚠️ partiel | `components/checkout/result-panel.tsx:37`, `components/checkout/receipt-lookup.tsx:26` ; scénario `tests/e2e/order-flow.ui.mjs:170` | Consultation réelle non lancée. Aucune promesse d’e-mail. |
| Rechargement après réponse perdue, double activation | ⚠️ partiel | `components/checkout/submit.ts:25`, `components/checkout/submit.ts:36`, `components/checkout/checkout-flow.tsx:65` ; tests `tests/e2e/order-flow.ui.mjs:236`, `tests/e2e/order-flow.ui.mjs:269` | Clé + empreinte en session, pas de coordonnées ni code ; si stockage refusé, protection mémoire seulement. |
| Prix changé : nouvelle vérification explicite, même à génération identique | ⚠️ partiel | `components/checkout/checkout-flow.tsx:99`, `components/cart/cart-summary.tsx:152` ; test `tests/e2e/order-flow.ui.mjs:348` | Cette branche PRICE_CHANGED est injectée ; le changement de génération est réel, par activation BC2, dans les deux modes. |
| Quantités/retrait, sans prix, 503, réseau | ⚠️ partiel | `tests/e2e/order-flow.ui.mjs:201`, `tests/e2e/order-flow.ui.mjs:303`, `tests/e2e/order-flow.ui.mjs:364` | Comportements existants conservés ; tests ajoutés non exécutés. 503 et réseau injectés par Playwright. |
| Erreurs reliées, focus et annonces | ⚠️ partiel | `components/checkout/receipt-lookup.tsx:75`, `components/checkout/receipt-lookup.tsx:93`, `components/cart/cart-summary.tsx:140` ; tests `tests/e2e/order-flow.ui.mjs:170`, `tests/e2e/order-flow.ui.mjs:201` | Focus et ARIA présents dans le code ; lecteur d’écran réel non vérifié. |
| Clavier seul et absence de débordement global à 390 px | ⚠️ partiel | `tests/e2e/order-flow.ui.mjs:84`, `tests/e2e/order-flow.ui.mjs:89` ; références longues sécables, tableau à défilement local focalisable | Assertions sur fiche, tiroir, panier, formulaires, erreurs et reçus écrites ; aucune mesure navigateur exécutée. |
| TypeScript | ✅ vérifié | `npx tsc --noEmit` : code retour 0 | Ne prouve pas le comportement du navigateur ni la persistance. |
| Tests nav autorisés | ✅ vérifié | `node --test tests/nav/*.test.mjs` : 49/49 tests passent, 0 échec, 0 ignoré | Avertissements Node `MODULE_TYPELESS_PACKAGE_JSON` ; tests nav sans navigateur/base. |
| Syntaxe du harnais | ✅ vérifié | `node --check tests/e2e/order-flow.ui.mjs` : code retour 0 | N’importe et n’exécute pas le test. |
| Exécution des 8 cas E2E, build, tests HTTP, base | ⏸️ différé | `tests/e2e/order-flow.ui.mjs`, script `package.json:31` | Non exécutés sur consigne ; aucun succès de parcours réel revendiqué. |
| Périmètre et fichiers préexistants | ✅ vérifié | `git status --short`, `git diff --check` | Les changements préexistants de coque/navigation ne font pas partie de cette tâche ; conservés. Aucun commit/PR/CI. |

## Fichiers de cette tâche

- `components/cart/cart-summary.tsx` : annonce du total et bannière de vérification à génération identique.
- `components/checkout/checkout-flow.tsx` : texte test, verrou d’envoi, vérification explicite après refus de prix.
- `components/checkout/submit.ts` : reprise par clé/empreinte et mutualisation de l’envoi concurrent identique.
- `components/checkout/receipt-details.tsx` (nouveau) : rendu commun des seules données enregistrées, notice de test faisant foi.
- `components/checkout/result-panel.tsx` : code séparé, détails enregistrés, accès à « Consulter un reçu ».
- `components/checkout/receipt-lookup.tsx` : rendu commun, focus, erreurs reliées, références sécables.
- `app/commande/page.tsx` : titre et fil d’Ariane « Commande de test ».
- `tests/e2e/order-flow.ui.mjs` (nouveau), `package.json` (un script seulement), présent audit.

## Exécution par Nico

Prérequis : Node ≥ 22, dépendances déjà installées, PostgreSQL local déjà démarré, base **jetable dédiée** `prodes_site_order_flow_test` déjà créée, rôle autorisé à recréer son schéma public. Le harnais refuse un autre nom ou un hôte distant. Il remet le schéma à zéro avant chaque cas et applique les migrations existantes. Aucune écriture sur une base de production.

Créer d’abord un build Next à jour avec les modifications ci-dessus (commande à lancer par Nico ; non exécutée ici) :

```sh
npm run c0:build && npm run build
```

Puis, depuis ce worktree :

```sh
PLAYWRIGHT_DIR=/chemin/absolu/vers/node_modules \
CHROMIUM=/chemin/absolu/vers/chromium \
SITE_TEST_DATABASE_URL=<url PostgreSQL locale>/prodes_site_order_flow_test \
SITE_TEST_PORT=3371 \
npm run test:e2e:flow
```

`PLAYWRIGHT_DIR` doit contenir le paquet `playwright` déjà installé ; `CHROMIUM` désigne son exécutable disponible. L’URL ci-dessus utilise exclusivement les identifiants **fictifs de développement local** du harnais existant : l’adapter au PostgreSQL de test si nécessaire, sans fichier `.env`. Le port doit être libre. URL et port ont ces valeurs par défaut ; les deux chemins sont requis.

Le script compile C0/BC2 comme les recettes existantes puis démarre et arrête son propre `next start` en local. Source catalogue `db`, persistance `postgresql`, environnement staging et instant `2026-10-20T09:00:00Z` sont fixés par le harnais. Générations et médias synthétiques sont activés par le vrai receiver BC2 via ses helpers ; devis, commandes et consultations passent par les vraies routes HTTP du site et sont contrôlés en base. Aucun succès de reçu simulé ; seules les fautes 503/réseau et PRICE_CHANGED à génération constante sont injectées explicitement.
