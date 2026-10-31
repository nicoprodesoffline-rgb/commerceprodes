# S1-A / I1 — la coque restituée (issue #63)

Branche locale `s1a/vitrine`, base `build/v51-site` @67b66503. Niveau de preuve : **BROWSER_VERIFIED** pour ce qui est mesuré, **CODE_CONFIRMED** sinon ; jamais OWNER_UAT.
Dépôt public : aucune désignation, référence, prix ni coordonnée réels dans le code, les tests ni les JSON ; les PNG (catalogue publié de l'instance locale) restent hors dépôt.

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| Barre utile (horaires C5, livraison incluse C1, liens Catalogue / Demande de devis) | ✅ BROWSER_VERIFIED | `capture-shell.json` : visible à 1440, 1024 et 390 px ; texte figé par `tests/nav/shell.test.mjs` | Aucun téléphone ni adresse : coordonnées pilotées par la Factory (S4), pas écrites en dur |
| En-tête en 3 niveaux (logo + nom, recherche, devis, panier avec compteur, ligne de catégories ≥ 768 px), collant | ✅ BROWSER_VERIFIED | haut de la fenêtre après défilement : 0 px aux 3 largeurs ; ligne de catégories visible ≥ 768 px, masquée à 390 px | La recherche reste la recherche serveur (nom de famille) : la recherche instantanée est en I2 |
| Menu « Catégories » (tous niveaux) = menu mobile | ✅ BROWSER_VERIFIED | Entrée ouvre, Échap ferme et rend le focus (`capture-shell.json`) ; suites `test:nav:ui` 4/4, `test:nav` 13/13 | Remplace le tiroir de l'ancien menu mobile (même contenu, sans bibliothèque en plus) |
| Barre mobile basse (Accueil, Catalogue, Devis, Panier + compteur) | ✅ BROWSER_VERIFIED | visible à 390 px seulement | 4 destinations qui existent ; pas de « Compare » (I3) |
| Pied de page à 3 colonnes (marque et baseline, liens rapides, horaires et mentions HT) + détail technique conservé | ✅ BROWSER_VERIFIED | `data-testid` du détail technique inchangés (`test:storefront` 21/21) | Liens FAQ / Contact / Mentions légales ajoutés en I4, quand les pages existent (aucun lien mort) |
| Page 404 (message, recherche, suites utiles), vrai statut 404 | ✅ | `test:nav` 13/13 (statut 404 aux niveaux 4+) | |
| Partage social (OpenGraph sobre) | ✅ CODE_CONFIRMED | `app/layout.tsx` | `robots: noindex` conservé : le SEO public reste une décision du propriétaire ; aucune marque déclarée aux moteurs (C22) |
| Chargement (`loading.tsx`) | ⏸️ non livré | un `loading.tsx` racine diffuse la page avant le 404 : statut 200 (constaté, retiré) ; garde `tests/nav/shell.test.mjs` | À revoir avec une alternative sans streaming |
| Débordement horizontal et zoom 200 % | ✅ BROWSER_VERIFIED | 0 px de débordement global (15 captures, 3 largeurs × 5 pages) et à 720 px (≈ 200 %), menu, recherche et panier atteignables | Contraste de l'anneau de focus et cibles tactiles ≥ 24 px : non mesurés |
| Aucun lien mort, aucune coordonnée en dur | ✅ CODE_CONFIRMED | `tests/nav/shell.test.mjs` | Ne contrôle que les liens en dur de la coque |

Suites (locales) : typecheck propre ; `test:nav:unit` 14/14 ; `test:nav` 13/13 ; `test:nav:ui` 4/4 ; `test:storefront` 21/21 ; `test:basis:ui` 4/4.

## Écarts motivés

- **Couleur** : l'ancien site avait une barre rouge `#cc1818`. La Design Authority V1 approuvée (DA-03, §2.2) écarte ce rouge comme couleur du site : la barre utile est encre, le signal reste lie-de-vin. Le logo historique (carré rouge et blanc, déjà dans `public/`) est repris tel quel.
- **Comparaison à l'ancien site** : pour I1, la structure (3 niveaux, menus, pied de page) est reprise du code de a985aca2 lu en entier ; le rendu de l'ancienne coque n'a pas été rejoué (option A prévue sur 6 écrans clés à partir d'I2). Les JPG compressés de la page d'arbitrages du 30/10 restent la seule trace visuelle.
