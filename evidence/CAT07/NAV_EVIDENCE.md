# CAT-07 — navigation Commerce : preuve (branche build/cat-v2-site, base 1883569b)

Niveau de preuve : TESTED_SYNTHETIC (documents C0 dérivés de F_FULL_CORRUPT/snapshot_s10_active.json, données STAGING_FIXTURE).
Aucun changement de C0. Dépôt public : aucun workflow ajouté, tests locaux uniquement.

## Comportement
- `lib/site-catalog/navigation.ts` (fonction pure) : 3 niveaux au maximum. Une catégorie de niveau 4 ou plus n'est ni nœud de
  menu, ni maillon de fil d'Ariane, ni page (404) ; ses familles sont rattachées à son ancêtre de niveau 3.
- Une rubrique sans famille dans son sous-arbre est masquée des menus, accueil et sous-catégories ; sa page répond (200, état vide).
- Une rubrique non validée est absente du DTO (Factory n'émet que les catégories ACTIVE à chaîne valide,
  readiness/channel_snapshot.py `publishable_categories`) : Commerce ne la connaît pas.
- Menu : disclosure ARIA à 3 niveaux, Entrée/Espace ouvre, Échap ferme et rend le focus, sortie du focus ferme ;
  panneau pleine largeur sous 640 px (le panneau débordait de la fenêtre à 375 px avant correction).
- « Également dans » (fiche famille) et fil d'Ariane utilisent la catégorie navigable, jamais un niveau 4+.

## Tests (commande -> nombre lu)
| Commande | Résultat |
|---|---|
| `npm run test:nav` (unitaire, 10 cas : 2/3/4+ niveaux, vide, cycle, hors DTO) | 10/10 |
| `tests/nav/menu.ui.mjs` (Chrome for Testing, 375/768/1280 px, clavier, fuites) | 4 scénarios, 4/4 |
| `npm run test:http` | 88/88 (1 assertion adaptée, voir ci-dessous) |
| `npm run test:storefront` (base prodes_site_cat75_bc3_test, port 3120) | 21/21 |
| `npm run test:bc2` / `test:bc4` / `test:bc4:http` | 80/80 ; 90/90 ; 7/7 |
| `npm run c0:test` / `c0:vendor-test` / `agent-ops:test` | 9/9 ; 8/8 ; 15/15 |
| `npx tsc --noEmit`, `npx next build` | sans erreur |

Mutations vérifiées : `MAX_NAV_LEVEL = 4` -> 3 tests unitaires échouent ; masquage des rubriques vides retiré -> 1 échec.

## Changement d'un test existant
`tests/http/site.test.mjs` affirmait que /categorie/mobilier liste la sous-catégorie vide mobilier-chaises (snapshot_s7 classe
toutes ses familles sous « signaletique »). Décision pilote (issue Factory #55) : rubrique vide masquée. L'assertion devient
« masquée, page 200 » ; le lien issu de parent_category_key avec familles reste couvert (tests/nav F_NAV_L2, storefront).

## Limites
- Un seul navigateur (Chrome for Testing 1223, Playwright 1.61.1 sur Chromium en cache) ; ni Firefox ni Safari ; pas d'axe/lecteur d'écran.
- Documents synthétiques à 4 familles ; pas de génération réelle Factory -> Site (INTEGRATED_REAL non atteint).
- Les fixtures F_NAV_* sont écrites temporairement sous c0/fixtures/documents (nom exigé par FixtureSource) puis supprimées ;
  le dossier C0 gelé n'est pas modifié dans git. Captures : hors git (prodes-night-20261029/commerce-cat-evidence/).
- Catégories sans famille masquées : un arbre à rubriques vides n'offre aucun menu (comportement voulu, non mesuré sur données réelles).

## Révision 2 (revue 2 de 8f, PASS_WITH_NOTES)
- Recette HTTP sans navigateur `tests/nav/navigation.http.mjs` (3 cas sur F_NAV_L2/L3/L4), lancée par `npm run test:nav` avec les 10 cas
  unitaires (13/13) : fil d'Ariane de 3 maillons, 404 pour un niveau 4+, « Également dans » sans niveau 4+, rubrique vide masquée et en 200.
  Mutations vérifiées : fil sans ancre niveau 3 -> 1 échec ; « Également dans » sans ancre -> 1 échec ; retrait du noindex -> 1 échec.
- Recette navigateur : `npm run test:nav:ui` (4/4), avec `PLAYWRIGHT_DIR` et, si le build 1228 de Chromium manque au cache,
  `CHROMIUM=<exécutable>` (1223 en cache sur le poste de test).
- Menu : un appui (souris ou toucher) sur une zone non interactive du panneau (marge, bord, bas) ne le ferme plus : `onMouseDown`
  du panneau annule le déplacement du focus hors des liens/boutons ; un clic ou un tap en dehors le ferme. Test souris (4 points) et
  tactile (`hasTouch`+`isMobile`, 375 px). Mutation (preventDefault retiré) -> échec, y compris avec les clics souris neutralisés.
- Page d'une rubrique vide : `robots: noindex, follow` propre à la page (le reste du site garde la directive globale `noindex, nofollow`).
- Suite relancée : test:http 88/88, test:storefront 21/21, agent-ops:test 15/15, tsc et next build sans erreur.
