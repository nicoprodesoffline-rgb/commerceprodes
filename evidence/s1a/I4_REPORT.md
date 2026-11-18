# S1-A / I4 — tiroir du panier, commande rapide, FAQ, contact, mentions provisoires, gamme PRO-INTENS, base fiscale (issue #63)

Branche locale `s1a/vitrine`, au-dessus d'I3 (`0e31b7ee`, poussé). Niveau de preuve : **BROWSER_VERIFIED** pour ce qui est mesuré (build de production, `next build` + `next start`), **CODE_CONFIRMED** sinon ; jamais OWNER_UAT.
Dépôt public : aucun nom, référence, prix ni coordonnée réels dans le code, les tests ni les JSON (booléens, compteurs et pixels) ; les PNG restent hors dépôt.

## Correction demandée par le pilote : la base fiscale n'est jamais affirmée sans la donnée

La page catalogue disait « base fiscale non précisée » (donnée C0) alors que le pied de page disait « Prix HT » : contradiction. Règle appliquée : « HT » n'est écrit que si TOUTES les fenêtres de prix de la génération ACTIVE déclarent `HT` (`lib/site-catalog/basis.ts`) ; sinon la formule neutre « Les prix et la base fiscale sont précisés sur le devis. »
Corrigés : pied de page (texte et mention du copyright), accueil (pastille, engagements, bande de réassurance), description et partage social de la page, note de totaux du panier avant l'aperçu serveur, FAQ.

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| Règle « HT seulement si déclaré » | ✅ | 6 tests purs (`tests/nav/basis.test.mjs` : tout HT, non précisée, mêlées, aucun prix, formule neutre, mémorisation) ; HTTP : génération HT → « hors taxes » au pied et dans la FAQ ; navigateur : génération mixte → ni « Prix HT » ni « hors taxes » sur l'accueil, la fiche, le pied de page et la FAQ | Ce que la Factory doit publier comme base fiscale reste une question ouverte du propriétaire : ce lot ne la tranche pas |

## Livré

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| Tiroir du panier : bouton « Panier » de l'en-tête, ouverture à chaque ajout, lignes par ordre alphabétique (famille, variante, total de ligne), − / +, retirer, total, « Finaliser la commande » ou « Demander un devis » selon l'aperçu serveur, « Voir le panier complet », fermeture par la croix, Échap ou un clic à côté | ✅ BROWSER_VERIFIED | `capture-cart.json` : ouverture à l'ajout, ordre alphabétique, + change la quantité, total lu au serveur, Échap ferme, le focus revient au bouton, clic à côté et croix ferment, état vide après retraits ; sans script, « Panier » mène à la page panier | Pas d'image par ligne (le panier du navigateur ne garde que des adresses et des quantités, jamais d'image ni de prix). Prix et total = aperçu serveur, demandé tiroir ouvert seulement |
| Commande rapide par référence : champ « Référence PI-… » dans la colonne du catalogue | ✅ BROWSER_VERIFIED | une référence mal formée est refusée à l'écran ; une référence valide ouvre la fiche de sa famille, variante choisie | Écart motivé : l'ancien site ajoutait directement au panier ; ici on arrive sur la fiche où le prix est vérifié par le serveur et la quantité fixée avant tout ajout |
| FAQ provisoire (accordéon natif, une question ouverte à la fois) | ✅ BROWSER_VERIFIED | une seule `details` ouverte à la fois ; 7 questions | Passée de 15 questions à 7 : seules les réponses décidées par le propriétaire sont écrites (livraison incluse C1, devis sans délai chiffré C3, pas de délai de livraison général C4, horaires C5, pas de garantie générale C7, base fiscale selon la donnée). Paiement (C9 supplantée), délais de traitement, minimum de commande, annulation, installation, données : non reprises faute de décision |
| Contact provisoire | ✅ | aucune coordonnée en dur (test de la coque + HTTP) | Aucun téléphone, e-mail ni adresse : coordonnées pilotées par la Factory (S4), à valider par le propriétaire. La seule voie de contact est la demande de devis |
| Mentions légales provisoires, `noindex` | ✅ | page qui dit qu'elle est provisoire | L'ancienne page n'était pas terminée (identifiant d'entreprise « à compléter », hébergeur d'un service fermé) : rien n'est inventé ; **le texte juridique est à fournir par le propriétaire avant toute ouverture au public** |
| Gamme PRO-INTENS (C11) : `/gamme-pro-intens`, bloc d'accueil conditionnel | ✅ BROWSER_VERIFIED | familles de la catégorie du même nom si la Factory la publie, sinon état vide dit ; arguments « NF certifié » et « Chorus Pro compatible » gardés (C8) ; aucune garantie | Aucune catégorie PRO-INTENS dans le catalogue local : l'état vide est celui vu ; la liste n'a pas été vue au navigateur |
| Liens FAQ / Contact / Mentions / Gamme / Ma sélection / Comparateur dans la barre utile et le pied de page | ✅ | `tests/nav/shell.test.mjs` : aucun lien vers une page absente | Barre utile : liens secondaires masqués sous 640 px (le débordement de 28 px à 390 px a été trouvé et corrigé) |

Suites locales : typecheck propre ; `test:nav:unit` 38/38 ; `test:nav` 41/41 ; `test:nav:ui` 4/4 ; `test:storefront` 25/25 ; `test:basis:ui` 5/5.
Contrôles au navigateur rejoués sur le BUILD DE PRODUCTION (`next start`) : coque, listes, favoris et comparateur, panier : 0 px de débordement global à 1440, 1024 et 390 px, aucune vérification en échec (les valeurs « faux » de `capture-shell.json` sont des éléments volontairement masqués à certaines largeurs).

## Non livré, motivé

| Élément | Raison |
|---|---|
| Nouveautés, promotions, best-sellers (carrousels) | C0 ne publie ni date de mise en ligne, ni promotions, ni ventes (champ C0 : hors périmètre, S2 sous GO) |
| Notifications « toasts » (T-T13) | bibliothèque de l'ancien site non reprise ; les confirmations sont dans la page (fiche) et le tiroir qui s'ouvre |
| Plan du site (T-T15-02), image de partage (T-T15-03) | exigent le domaine public (adresses absolues) et une image validée : décisions de publication |
| Écrans de chargement (T-T15-06) | un `loading.tsx` racine casse le vrai 404 (constaté en I1) |
| « Ajouter tout au panier » des favoris | une famille à plusieurs variantes n'a pas de variante unique à ajouter |

## À ne pas oublier avant toute mise en ligne

- Le bandeau « Boutique de démonstration… STAGING_FIXTURE » est correct en staging et **ne doit pas partir en ligne**.
- La route `GET /api/site/search` n'a pas de limite de débit (relevé par 8f) : à surveiller quand le catalogue sera réel.

## Retouches après la revue de conformité d'8f (gate UX : PARTIAL, aucun écran bloqué)

| Retouche | Statut | Preuve | Limite |
|---|---|---|---|
| Gamme PRO-INTENS : plus de promesse de date | ✅ | le texte vide est « Aucun produit de la gamme n'est publié pour le moment. » ; test HTTP : aucun « prochainement / bientôt » | L'Owner n'a validé aucune date |
| Fiche : colonne « Validité » du tableau de prix | ✅ BROWSER_VERIFIED | à 1440 et 1024 px la phrase entière tient dans la colonne (cellule non tronquée, aucun défilement caché) ; sous 640 px, où la colonne n'a pas la place (elle était masquée), la même phrase passe sous le prix, entière ; `capture-selection.json` : `validity_fully_readable_1440 / 1024 / 390` | À 1440 px la phrase n'était déjà pas tronquée : c'est sous 640 px qu'elle manquait |
| Tiroir du panier : Échap rend le focus au bouton qui l'a ouvert | ✅ BROWSER_VERIFIED | ouvert par « Ajouter au panier » : le focus revient à ce bouton ; ouvert par « Panier » : au bouton Panier (`drawer_focus_returns_to_add_button`, `drawer_focus_returns_to_cart_button`) | Le bouton d'ajout est désactivé pendant la vérification : il est donc mémorisé au clic, avant la vérification |
| Aucun nom de fournisseur dans les tests que je modifie | ✅ | `tests/basis/basis.ui.mjs` lit l'adresse de la famille de test dans la fixture C0 de départ (`FAMILY_SLUG`) au lieu de l'écrire en dur | Le nom reste dans les fixtures C0 gelées (`c0/fixtures/…/F_GMCE_VARIANTS`, déjà publiques) et dans `tests/http/site.test.mjs`, `tests/basis/escape.ui.mjs`, `tests/basis/basis-fixtures.mjs` (en commentaire), que je ne touche pas : C0 est gelé |

Suites locales après retouches : typecheck propre ; `test:nav:unit` 38/38 ; `test:nav` 41/41 ; `test:nav:ui` 4/4 ; `test:storefront` 25/25 ; `test:basis:ui` 5/5.
