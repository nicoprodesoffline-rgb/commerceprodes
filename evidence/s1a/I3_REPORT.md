# S1-A / I3 — fiche famille, favoris, comparateur, récemment consultés, devis depuis la fiche (issue #63)

Branche locale `s1a/vitrine`, au-dessus d'I2 (`030f6973`, `98db273b`). Niveau de preuve : **BROWSER_VERIFIED** pour ce qui est mesuré, **CODE_CONFIRMED** sinon ; jamais OWNER_UAT.
Dépôt public : aucun nom, référence, prix ni coordonnée réels dans le code, les tests ni les JSON (booléens, compteurs et pixels seulement) ; les PNG restent hors dépôt.

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| « Ma sélection » (favoris) : cœur sur les cartes et la fiche, page `/favoris` (grille, retirer, vider), produits retirés du catalogue signalés puis oubliés | ✅ BROWSER_VERIFIED | `capture-selection.json` : 2 favoris mémorisés, retrait, 3 largeurs sans débordement ; `tests/nav/local-list.test.mjs` | Mémoire de l'appareil (`localStorage`) : une adresse de famille seulement, jamais un prix ; rien n'est partagé entre appareils |
| Comparateur au grain Famille : « Comparer » (4 au plus, refus dit), barre fixe, page `/comparer` (colonnes = familles ; catégorie, référence ou nombre de variantes, choix, description, prix « à partir de »), « Meilleur prix » posé PAR LE SERVEUR, retirer, noindex | ✅ BROWSER_VERIFIED | colonnes = familles choisies ; barre visible ; retrait ; limite de 4 couverte par test pur (5e refusée, rien retiré en silence) ; table dans son cadre à 390 px | « Éco-participation » et fiches techniques de l'ancien tableau : non publiées par C0 (S2). Comparaison au niveau famille : le choix de la variante se fait sur la fiche |
| Récemment consultés (12 en mémoire, 8 affichés dès 2 autres vues) et Produits similaires (8 de la même catégorie) | ✅ BROWSER_VERIFIED | blocs affichés après 4 fiches visitées ; similaires présents | « Similaires » = même catégorie principale, ordre du DTO : aucune règle de pertinence inventée |
| Demander un devis depuis la fiche | ✅ BROWSER_VERIFIED | le bouton ajoute la variante au panier (prix vérifié par le serveur) puis ouvre la demande de devis existante, avec ses coordonnées et son message | Pas de seconde fenêtre de saisie (V-W01) : un seul parcours de devis, celui du panier ; la quantité de la fiche est reprise |
| Fil d'Ariane structuré (JSON-LD) et version imprimable | ✅ BROWSER_VERIFIED | JSON valide `BreadcrumbList`, `<` échappés, nonce de la requête ; en mode impression l'en-tête, le pied de page, la barre du comparateur, la barre mobile et les boutons de liste sont masqués | Le site reste `noindex` |
| Lecture de familles par adresse `GET /api/site/families` (API-33) | ✅ | tests purs (`family-lookup`, 4) et HTTP (ordre gardé, inconnu à part, adresses invalides écartées, 20 au plus, JSON échappé, 503 sans catalogue) | Même régime que `/api/site/search` : lecture seule sur la génération ACTIVE, aucun champ C0 |
| Stockage navigateur refusé | ✅ BROWSER_VERIFIED | aucune erreur de page quand `localStorage` est interdit | La liste vit alors en mémoire de la page |
| « Ajouter tout au panier » des favoris (V-E18-04) ; commande rapide par référence (T-T10, API-31) | ⏸️ non livrés | — | Une famille à plusieurs variantes n'a pas de variante unique à ajouter ; la commande rapide se branche mieux avec le panier (I4) |

Suites locales : typecheck propre ; `test:nav:unit` 32/32 ; `test:nav` 35/35 ; `test:nav:ui` 4/4 ; `test:storefront` 23/23 ; `test:basis:ui` 4/4.

## Adaptation d'un test existant (à valider)

`tests/basis/escape.ui.mjs` : la garde « aucun `<script>` injecté » acceptait déjà les scripts de données de Next (`self.__next_f…`, `<` échappés). Elle accepte désormais aussi le bloc `application/ld+json` (même condition : aucun `<script`, `<img`, `<svg` non échappé dans le texte). Le texte hostile y figure bien, échappé ; la garde reste active pour tout autre script. Aucune autre assertion n'est modifiée ni affaiblie.
Test ajouté dans `tests/http/storefront.test.mjs` : pages `/favoris` et `/comparer` en 503 sans catalogue, et les deux routes de lecture.
