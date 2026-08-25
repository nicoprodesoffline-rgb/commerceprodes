# Catalog Pagination Pilot — 2026-04-21

## Contexte

Tâche réelle utilisée comme pilote process :
- pagination serveur pour `/search`
- pagination serveur pour `/search/[collection]`
- conservation des filtres et du tri
- canonical SEO propre pour `?page=`

Travail implémenté d'abord dans un worktree isolé, puis reporté dans le repo principal.

## Outils / méthodes évalués

### 1. Worktree isolé

Verdict : **gros oui**

Pourquoi :
- a permis de coder et vérifier sans polluer le repo actif ;
- a absorbé des effets de bord locaux comme l'installation de dépendances ;
- a permis d'annuler proprement un auto-changement Next sur `tsconfig.json`.

Décision :
- utiliser un worktree isolé par défaut pour toute tâche non triviale sur `commerce`.

### 2. Petit working set / contexte court

Verdict : **oui**

Ce qui a aidé :
- lecture limitée à `CLAUDE.md`, `AGENTS.md`, `state/*` et la surface `search/supabase` utile ;
- pas de relecture large du repo ;
- plan court avant implémentation.

Décision :
- garder ce mode de travail comme standard.

### 3. RTK

Verdict : **utile mais secondaire**

Mesure sur ce lot :
- diff ciblé brut : `21777` caractères
- diff via `rtk git diff ...` : `17486` caractères
- gain : environ `-19.7%`

Lecture :
- aide à réduire un peu le bruit shell ;
- n'est pas le levier principal sur un diff code relativement propre.

Décision :
- garder RTK comme outil de confort pour `git`, builds, logs et sorties verbeuses ;
- ne pas le traiter comme outil central de review.

### 4. code-review-graph

Verdict : **pas convaincant sur ce cas**

Commande utilisée :
- `code-review-graph detect-changes --base main --brief`

Résultat :
- `5 changed file(s)`
- `0 changed function(s)/class(es)`
- `0 affected flow(s)`
- `0 test gap(s)`
- `risk score 0.00`

Lecture :
- le signal produit était trop faible pour un changement pourtant réel et non trivial ;
- l'outil semble moins adapté ici à un lot orienté pages Next, metadata, query params et wiring serveur.

Décision :
- ne pas institutionnaliser `code-review-graph` sur `commerce` pour ce type de tâche ;
- le réserver à des diffs plus orientés moteur, refactor ou blast radius fonctionnel.

## Ce qu'on garde comme standard

À garder :
- worktree isolé
- petit working set
- plan court
- RTK en appoint

À ne pas sanctuariser pour l'instant :
- code-review-graph sur les tâches `commerce` de type page wiring / UI serveur

## Note de méthode

Ce pilote rappelle une règle simple :
- on adopte un outil parce qu'il aide sur une vraie tâche ;
- on ne l'adopte pas parce qu'il est prometteur en théorie.
