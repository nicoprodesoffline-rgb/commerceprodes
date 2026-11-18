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

## 5. La teinte fine (`ral.json`) et la règle de sûreté — décision de l'Owner du 18/11

Deux niveaux : la **nuance** (§4, 38 noms) sert au filtre, aux listes et à l'écran de l'opérateur ; la **teinte fine** ne sert qu'au dessin de la pastille sur la fiche produit.
- **Sources de la teinte fine**, par partie (mêmes parties qu'au §4), la première trouvée gagne :
  1. la teinte fixée par l'opérateur pour ce texte (écran « Coloris sans nuance », facultative) ;
  2. le code RAL écrit dans le texte ;
  3. un nom fin de couleur présent dans le texte, pris dans une liste publique de noms de couleurs avec leurs teintes (Factory seulement) ;
  4. un qualificatif présent dans le texte (clair, foncé, pastel, vif, mat, brillant), appliqué par une règle à la teinte de la nuance : éclaircir, assombrir, désaturer, saturer. Aucune teinte n'est choisie à la main.
  Les sources 1, 3 et 4 sont publiées en `#rrggbb`, la source 2 en `RAL NNNN`.
  - « RAL 7016 » est lu partout.
  - Un code nu de 4 chiffres n'est lu que s'il figure dans `ral.json` **et** que la partie n'a pas la forme « NNNN (couleur) » : un code suivi d'une couleur entre parenthèses est une référence de fournisseur, même s'il ressemble à un RAL.
- **Attribution, dans la Factory seulement** : à chaque nuance de « Pastille » correspond le RAL de la partie qui l'a donnée, s'il y en a un.
  - Si l'opérateur a choisi les nuances, la teinte fine n'est gardée que si son choix a autant de nuances que la règle ; sinon, aucune teinte fine.
  - Multicolore et Non précisé n'ont jamais de teinte fine.
- **Transport, sans champ C0 nouveau** : la caractéristique réservée **`Teinte`**, posée au même endroit que `Pastille` (variante, ou famille si toutes la partagent).
  - Sa valeur a autant de parties que `Pastille`, séparées par ` / `. Chaque partie est `RAL NNNN`, une teinte `#rrggbb` (six chiffres hexadécimaux en minuscules) ou, à défaut, le nom de la nuance elle-même : `RAL 7016 / Blanc`, `#5b6770 / Blanc`.
  - `Teinte` est absente quand aucune partie n'a de RAL.
  - La Factory écarte toute caractéristique source dont la clé se plie en `teinte`.
- **SITE** :
  - la moitié (ou la pastille) dont la partie de `Teinte` est `RAL NNNN` prend la teinte de `ral.json`, et celle dont la partie est `#rrggbb` prend cette teinte, toujours avec le **motif de sa nuance** ; les autres gardent la teinte de leur nuance ;
  - une `Teinte` dont le nombre de parties diffère de `Pastille`, un code absent de `ral.json` ou une teinte mal écrite est ignorée en entier ;
  - `Teinte` ne s'affiche jamais comme une caractéristique, n'entre dans aucun filtre et dans aucune recherche ; le filtre Coloris ne lit que `Pastille`.
- **Fiche produit : pastilles seules (décision de l'Owner du 18/11, après la règle de sûreté)**
  - Toute valeur d'axe coloris qui a une pastille, `Non précisé` compris (pastille neutre), s'affiche **en pastille seule**, jamais avec son nom à côté.
  - Le texte exact passe en infobulle et en nom accessible ; la valeur choisie est écrite dans la légende de l'axe.
  - Seule une valeur sans `Pastille` publiée (catalogue publié avant les nuances) reste écrite en texte.
  - La cible tactile ne change pas (44 px) ; l'état choisi, l'état incompatible et le focus clavier restent lisibles sans le texte.
- **Comparaison du rendu (mesure seulement)** : deux rendus sont **confondus** s'ils ont le même motif (l'aplat neutre de `Non précisé` compte comme `uni`) et des teintes à moins de 10 en ΔE CIELAB 1976, partie par partie.
  - Ce seuil est une constante unique du site.
  - La comparaison ne pilote plus l'affichage : elle sert aux tests et à compter les fiches où deux coloris différents restent confondus.

## 6. Dimensions et poids (`tranches.json`) — décision de l'Owner du 18/11

- **Libellés réservés**, publiés exactement ainsi dans `characteristics` (C0 v2 inchangé) : `Longueur`, `Largeur`, `Hauteur`, `Profondeur`, `Diamètre`, `Épaisseur`, `Poids`.
  - Valeur : le format de `quantities.display_text`, toujours en cm ou en kg : « 180 cm », « 3,5 kg », « 1 200 cm ».
  - La séparation est une espace insécable ; la virgule est décimale ; les milliers sont séparés par une espace insécable.
- **Détection, dans la Factory seulement, à la projection** (`catalog/domain/dimensions.py`). Sources, de la plus sûre à la moins sûre :
  1. une mesure normalisée sous une caractéristique nommée ;
  2. un texte nommé (« lg 180 x l 80 x ht 75 cm », « d. 80 mm », « Ø 60 ») ;
  3. un texte « A x B x C unité » sans axe nommé : longueur × largeur × hauteur, dans l'ordre d'écriture, seulement si la mesure de contrôle le confirme (plus de 90 % des familles qui ont aussi des axes nommés). Au 18/11, elle ne le confirme pas : ces textes ne donnent aucun axe ;
  4. une mesure dans la désignation.
  Règles :
  - une source moins sûre ne remplace jamais une plus sûre ; une contradiction lève un signalement sans rien bloquer ;
  - un nombre sans unité n'est lu que si la même famille donne l'unité ailleurs, de façon constante ; aucune unité n'est devinée ;
  - le poids de l'Extracteur sans unité est en kg ;
  - une caractéristique source du même libellé est remplacée par la valeur normalisée ;
  - le fait source n'est jamais réécrit.
- **Filtre par tranches (SITE et écran Factory)**, dans l'ordre des libellés ci-dessus, après Coloris, Matière et Type :
  - **valeurs lisibles** : seule une valeur de la forme « nombre unité », avec l'unité `cm` (ou `kg` pour Poids), est lue ; les espaces, insécables comprises, sont ignorées et la virgule est décimale ; le reste est ignoré ;
  - **porteurs et seuil** : une famille porte une valeur par la famille ou par l'une de ses variantes ; mêmes réglages qu'au §3 (`seuil_pct`, `familles_min`) ; si une rubrique mêle deux unités pour un même libellé, il n'y a pas de filtre ;
  - **bornes** :
    - L = toutes les valeurs des familles porteuses (chaque valeur distincte d'une famille une fois), triées ;
    - pour i = 1 à 4 : brute = L[⌊i·n/5⌋] ;
    - borne = l'arrondi « rond » de brute : mantisse la plus proche dans la liste `bornes_rondes` de `tranches.json` × la puissance de dix, à égalité la plus petite ; une puissance négative se calcule en divisant par 10^|e| ;
    - on garde les bornes b telles que L[0] < b ≤ L[n−1], sans doublon, triées ;
  - **tranches** : « moins de b1 », « b1 à b2 », …, « bk et plus », demi-ouvertes [bas, haut) ; une famille compte dans chaque tranche où tombe au moins une de ses valeurs ; une tranche vide n'est pas proposée ;
  - le filtre s'affiche s'il reste au moins `valeurs_min` tranches ;
  - plusieurs tranches d'un même filtre se combinent en OU ; deux filtres entre eux, et avec les autres filtres, en ET ;
  - **adresse** : `?longueur=80-150`, `?longueur=-80`, `?longueur=300-` (bornes avec un point décimal), répétable.
- **Fiche produit** : ces caractéristiques s'affichent comme les autres.
- `tranches.json` donne des cas et leurs tranches attendues (`min` / `max` à `null` pour une tranche ouverte), joués tels quels par les deux dépôts.
