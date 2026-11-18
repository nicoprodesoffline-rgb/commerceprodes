# S1-A / I2 — accueil, catalogue, recherche, catégorie, carte produit, recherche instantanée (issue #63)

Branche locale `s1a/vitrine`, au-dessus d'I1 (`906f106e`) et de `b786e2e2` (déjà revu et poussé). Niveau de preuve : **BROWSER_VERIFIED** pour ce qui est mesuré, **CODE_CONFIRMED** sinon ; jamais OWNER_UAT.
Dépôt public : aucune désignation, référence, prix ni coordonnée réels dans le code, les tests ni les JSON (les JSON ne gardent que des booléens, des compteurs et des pixels) ; les PNG restent hors dépôt.

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| Accueil : accroche, 4 engagements, bande de réassurance, catégories, familles (12 premières) + « Voir tout le catalogue », appel au devis | ✅ BROWSER_VERIFIED | `capture-lists.json` : 3 largeurs, 0 px de débordement, statut 200 ; « N références » = variantes publiées comptées par le serveur (C6) | Textes limités aux décisions du propriétaire : livraison incluse (C1), HT (C2), réponse rapide sans délai (C3), horaires (C5). Aucun moyen de paiement, aucun téléphone |
| Gamme PRO-INTENS (C11) sur l'accueil | ✅ CODE_CONFIRMED | rendue seulement si la Factory publie une catégorie de ce nom ; sinon rien | Non vue au navigateur : le catalogue local n'a pas cette catégorie (page de la gamme = I4) |
| Catalogue / recherche : « Tout le catalogue » ou « Résultats pour « … » », compteur, message sans résultat, filtre de prix mini/maxi, tri, pages de 24, filtres actifs, « Effacer », colonne des catégories (accordéon sans script) et pastilles sur mobile | ✅ BROWSER_VERIFIED | tri croissant / décroissant vérifiés sur les montants affichés ; filtre = fourchette exacte ; prix refusé dit, jamais corrigé ; sans script : « Appliquer » et la recherche fonctionnent par envoi GET ; 6 tests purs `tests/nav/listing.test.mjs` | Pas de tri « populaires » ni « nouveautés » ni filtre « disponibles » : C0 ne publie ni ventes, ni date de mise en ligne, ni stock (C15) ; le tri « Nom » est ajouté |
| Page catégorie : mêmes filtres, tri, pages et colonne ; compteur ; 404 si inconnue | ✅ BROWSER_VERIFIED | idem ; `test:nav` 26/26 (404 niveau 4+) | Image de partage au nom de la catégorie (V-E04-05) : non livrée |
| Carte produit : image, catégorie, nom, description, **prix « à partir de »** (plus bas prix unitaire retenu par `selectPrice` C0 à l'instant serveur) ou « Sur devis », badge « Livraison incluse », survol « Voir le produit → » | ✅ BROWSER_VERIFIED | prix = ceux de la fiche ; base fiscale dite une fois par écran quand elle est uniforme, sinon sur la ligne | L'ancien site affichait une fourchette « min – max » : « à partir de » est plus honnête avec des paliers dégressifs (écart motivé). Boutons Comparer et favoris : I3 |
| Recherche instantanée : dès 2 caractères, 0,2 s de pause, 8 familles (image, nom, catégorie, prix), « Voir tous les résultats », croix, Échap, flèches (combobox WAI-ARIA), Entrée = page de résultats | ✅ BROWSER_VERIFIED | `capture-lists.json` : options, une seule sélectionnée, Échap ferme sans vider le champ, croix vide, Entrée mène aux résultats ; sans script, le formulaire envoie vers la page de résultats ; test pur `tests/nav/suggest.test.mjs` | Nouvelle route de lecture `GET /api/site/search` (lecture seule, 503 si le catalogue est indisponible). **Hors de ma liste « API existantes » : à valider par le pilote** ; aucune écriture, aucun champ C0 |
| Nouveautés, carrousels (V-E01-13/15), commande rapide par référence (T-T10, API-31), produits par adresse (API-33) | ⏸️ non livrés | — | Nouveautés : C0 ne publie pas de date de mise en ligne (champ C0 manquant, STOP si voulu). Commande rapide et API-33 : avec le panier et les favoris (I3/I4) |
| Console en production | ✅ BROWSER_VERIFIED | `next build` + `next start` : le message « eval() is not supported… Content-Security-Policy » **n'apparaît pas** ; la CSP de production n'a pas `unsafe-eval` ; il vient donc du mode développement | Seul message restant : la ressource 404 de la page volontairement introuvable |
| Bandeau « Boutique de démonstration… STAGING_FIXTURE » | ⚠️ à retirer avant toute mise en ligne | affiché seulement quand `data_label = STAGING_FIXTURE` | Correct en staging ; **il ne doit pas partir en ligne** (décision de publication, pas de code) |

Suites locales : typecheck propre ; `test:nav:unit` 23/23 ; `test:nav` 26/26 ; `test:nav:ui` 4/4 ; `test:storefront` 21/21 ; `test:basis:ui` 4/4.

## Comparaison à l'ancien site (option A, bornée)

L'ancienne interface (a985aca2) a été extraite par `git archive` dans un dossier jetable hors dépôt, installée hors ligne depuis le cache npm, lancée sous `env -i` avec des adresses Supabase et Shopify en `127.0.0.1:9` et une fixture anonyme à la place de la couche de données (aucune clé, aucun accès sortant). 9 captures de référence (accueil, catalogue, catégorie × 1440 / 1024 / 390), hors dépôt.

| Élément de l'ancien rendu | Dans le site restauré | Pourquoi |
|---|---|---|
| Barre rouge, logo, recherche, devis, panier, menu de catégories | repris (barre encre : DA-03) | structure identique, couleur de la DA |
| Fenêtre « Vous êtes : Mairie / École / Professionnel » | retirée | C12 |
| « Assistance intelligente », témoignages | retirés | C13, C14 |
| Promotions / best-sellers / Nouveautés (carrousels) | absents | pas de donnée C0 (promotions, ventes, date de mise en ligne) |
| « Devis sous 24 h », « Paiement sécurisé », téléphone, e-mail | remplacés par les textes validés ou absents | C3, C9 (supplantée), coordonnées pilotées par la Factory (S4) |
| Catalogue : colonne catégories, filtre de prix, « Disponibles seulement », tri vertical, cartes avec badge livraison, Comparer et cœur, commande rapide | colonne, filtre, tri (formulaire), badge repris ; « Disponibles » absent (C15) ; Comparer et cœur = I3 ; commande rapide = I3/I4 | |

Limite : l'ancien rendu est celui de la fixture (24 produits fictifs), pas d'un vrai catalogue ; la comparaison porte sur la structure et les fonctions, pas sur des données. Relue : catalogue 1440 et accueil 1440 ; les autres captures sont prises, non toutes relues une à une.
