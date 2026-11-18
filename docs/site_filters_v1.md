# Filtres du site, version 1 (cercle 4, ligne 4.27) — règle commune Factory ↔ SITE

Écrit le 18/11/2026 (f1/EC, issue #112). Ce n'est **pas** un contrat C0 : aucun champ de document ne change. C'est une règle de calcul
que deux programmes appliquent chacun de leur côté :
- la Factory, au moment de publier (regroupement) et dans son écran « Filtres du site » ;
- le SITE, sur sa page de rubrique (filtres et pastilles).

Les deux jeux d'essai de ce dossier sont joués **tels quels** par les deux dépôts. Le SITE en recopie les fichiers à l'octet.

## 1. Le pli (`pli.json`)

La clé de regroupement d'un libellé ou d'une valeur se calcule en cinq étapes :
1. mise en minuscules (`str.lower` / `toLowerCase`) ;
2. décomposition NFKD, puis retrait des signes diacritiques (catégorie Unicode M) ;
3. toute suite de caractères qui ne sont ni lettre ni chiffre Unicode (le soulignement compris) devient une espace ;
4. espaces retirées aux deux bouts ;
5. dans chaque mot de plus de 3 caractères qui finit par `s` ou `x`, ce dernier caractère est retiré.

La clé n'est jamais affichée : « gris » donne `gri`, et c'est voulu. Aucun synonyme n'est deviné.

## 2. Le regroupement (Factory, à la projection)

Il ne porte que sur les caractéristiques dont le libellé a le pli de « Coloris », de « Matière » ou de « Type » :
- le libellé est publié exactement sous cette forme : `Coloris`, `Matière`, `Type` ;
- chaque valeur est publiée sous la **forme réelle la plus fréquente** de son groupe (même pli et même libellé), comptée en familles publiées. À égalité, c'est la plus petite dans l'ordre des points de code qui est retenue.

Aucune forme n'est inventée. Une valeur à plusieurs termes (« Rouge, Bleu ») reste une seule valeur.

## 3. La règle d'affichage (`regle.json`, SITE et écran Factory)

Le calcul porte sur les familles listées sur la page d'une rubrique (sous-arbre, classements secondaires compris) :
- moins de `familles_min` familles : aucun filtre ;
- pour chaque filtre, dans l'ordre `Coloris`, `Matière`, `Type` :
  - **Matière** et **Type** : une famille porte une valeur quand sa propre caractéristique, ou celle de l'une de ses variantes, a ce libellé et cette valeur, comparés **à l'octet** ;
  - **Coloris** ne lit **que** la caractéristique réservée `Pastille` (§4), jamais le texte de coloris. Sa valeur se découpe sur ` / ` (bicolore) : la famille porte chacune des deux nuances. `Non précisé` n'est jamais une valeur et ne compte pas dans le remplissage ;
- un filtre s'affiche si les familles qui portent au moins une valeur représentent au moins `seuil_pct` % des familles listées, **et** s'il y a au moins `valeurs_min` valeurs distinctes ;
- options : chaque valeur avec son nombre de familles, triée par nombre décroissant, puis par ordre des points de code ;
- combinaison : plusieurs options d'un même filtre se combinent en OU ; deux filtres entre eux, et avec le filtre de prix, en ET ;
- un catalogue publié avant les nuances (aucune `Pastille`) n'a pas de filtre Coloris, et ne produit aucune erreur.

**Réglages** (`reglages_par_defaut`) : `seuil_pct` = 30, `valeurs_min` = 2, `familles_min` = 5.
- Chaque dépôt les tient en **une seule constante**.
- Un test de chaque dépôt vérifie que sa constante est égale à `reglages_par_defaut`.
- Pour changer un réglage : modifier ce fichier, puis les deux constantes.

## 4. La nuance (`palette.json`) : décision de l'Owner du 18/11

- **Palette** : 38 nuances nommées, chacune avec une teinte d'affichage et un motif. Les motifs sont `uni`, `metal`, `brosse` (inox), `galva`, `bois` et `transparent`, et c'est le motif qui distingue à l'œil une finition d'une teinte unie voisine. S'y ajoutent `Multicolore` (pastille arc-en-ciel), `Non précisé` (pastille neutre) et le bicolore : deux nuances séparées par ` / `, dessinées en deux moitiés.
- **Attribution, dans la Factory seulement** (`catalog/domain/color_shades.py`) :
  - texte du coloris → nuance(s), au plus proche ;
  - le choix de l'opérateur (écran « Coloris sans nuance »), enregistré sur le pli du texte, l'emporte sur la règle, partout et pour les imports suivants ;
  - un texte que la règle ne place pas est publié `Non précisé` et apparaît dans l'écran ; rien n'est bloqué ;
  - le fait source n'est jamais réécrit.
- **Transport, sans champ C0 nouveau** : la caractéristique réservée `Pastille`, sur la variante ou, si toutes la partagent, sur la famille. Valeurs possibles : un nom de la palette, deux noms séparés par ` / `, `Multicolore` ou `Non précisé`. La Factory écarte toute caractéristique source dont la clé se plie en `pastille`.
- **SITE** :
  - il ne devine aucune teinte. La pastille est celle de `Pastille` : teinte et motif lus dans `palette.json`, recopié à l'octet ;
  - l'infobulle et le nom accessible restent le texte exact du coloris du produit ;
  - `Pastille` ne s'affiche jamais comme une caractéristique : ni sur la fiche, ni dans les textes, ni dans un autre filtre, ni dans la recherche ;
  - sans `Pastille`, il n'affiche aucune pastille.
