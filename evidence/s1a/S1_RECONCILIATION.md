# S1 — rapprochement de l'inventaire Commerce avec ce qui est livré (issue #63)

Source : `docs/commerce/frontend_commerce_inventaire.json` (branche `commerce-front`, vague S1 = **172 lignes**), décisions C1–C22. État : branche `s1a/vitrine`, dernier commit rapproché `018178e8`.
Une seule valeur par ligne : **LIVRÉ** (code + test ou capture), **PARTIEL** (livré mais différent ou incomplet : la dernière colonne dit ce qui manque), **À FAIRE**. Une ligne peut en plus porter « attend GO » : elle n'est ni construite ni lancée sans décision.
Limite : ce tableau classe ce que j'ai livré et mesuré en I1–I4 et suites ; les lignes « existant 67b66503 » viennent du moteur du site avant S1-A et sont couvertes par `test:storefront`, sans avoir été rejouées une à une. Aucune ligne n'est « validée » par un humain (OWNER_UAT jamais déclaré).

## Décompte (dénominateur : 172 lignes S1)

| Valeur | Lignes |
|---|---:|
| LIVRÉ | 89 |
| PARTIEL | 51 |
| À FAIRE | 32 |
| Total | 172 |

Lignes qui **attendent un GO** (toutes valeurs confondues) : 40, dont : dégel C0 (demande sans ligne, champs d'organisme et de marché) (10), coordonnées (7), domaine public + image validée (2), paiement (C9 supplantée le 31/10) (2), dégel C0 (S2 : éco-participation, documents) (2), base fiscale non décidée + livraison (C1/C10) (2), dégel C0 (S2) (2), texte juridique (propriétaire) (2), domaine public + SEO (propriétaire) (2), e-mails (2), dégel C0 (S2) : date de mise en ligne (1), dégel C0 : ventes, date de mise en ligne (1), dégel C0 : stock (C15) (1), dégel C0 (S1-B) (1), base fiscale non décidée (C2/C10) (1), paiement (1), SEO public (propriétaire) (1).
Lignes À FAIRE **sans GO nouveau**, construites ensuite par petits lots : V-E03-15 et T-T15-06 (squelette de chargement de la recherche), V-E05-13 (quantité minimale), V-E18-04 (« ajouter tout au panier » des familles à variante unique), T-T01-07 (icône d'onglet), T-SRV-01 (limite d'envois) ; et, pour passer V-E01-15 de PARTIEL à LIVRÉ, les flèches des carrousels.
Le « devis express » sans produit (V-E12-*) **ne peut pas** être construit sans GO : le contrat C0 exige au moins une ligne par demande de devis et fixe les clés du contact.

## Tableau

| Ligne | Fonction (début) | Valeur | Preuve | Ce qui manque / remarque |
|---|---|---|---|---|
| `V-E01-01` | Bandeau d'accroche (« hero ») : titre « Équipements pour collectivités », pastille « B2B · | LIVRÉ | tuiles 897c9488 / 0de6726c ; test:content 85/85 ; b786e2e2 | Textes limités aux décisions C1–C3 ; « HT » seulement si la génération le déclare (39acc139) |
| `V-E01-02` | Bouton « Voir le catalogue » → /search | LIVRÉ | tuiles 897c9488 / 0de6726c ; test:content 85/85 ; b786e2e2 | Textes limités aux décisions C1–C3 ; « HT » seulement si la génération le déclare (39acc139) |
| `V-E01-03` | Bouton « Demander un devis » | LIVRÉ | tuiles 897c9488 / 0de6726c ; test:content 85/85 ; b786e2e2 | Textes limités aux décisions C1–C3 ; « HT » seulement si la génération le déclare (39acc139) |
| `V-E01-04` | Bande de réassurance 4 pictos (livraison, devis 24 h, mandat, téléphone) | PARTIEL | b786e2e2 (bande de réassurance) | Pas de pictos, ni téléphone, ni mandat (C9 supplantée) — **attend GO : coordonnées** |
| `V-E01-06` | Repli : si aucune catégorie « mise en avant », grille « Nos catégories » (nom + nombre de  | LIVRÉ | tuiles 897c9488 / 0de6726c ; test:content 85/85 |  |
| `V-E01-09` | Bloc PRO-INTENS sombre : pastille « ★ Gamme exclusive », bouton « Voir la gamme → » (/gamm | PARTIEL | 1e693a7a (bloc conditionnel + /gamme-pro-intens) | Pas de carrousel de 8 cartes ; bloc affiché seulement si la Factory publie la catégorie |
| `V-E01-10` | Bandeau rouge « Besoin d'un devis personnalisé ? » + bouton « Demander un devis → » (/devi | LIVRÉ | tuiles 897c9488 / 0de6726c ; test:content 85/85 ; b786e2e2 | Textes limités aux décisions C1–C3 ; « HT » seulement si la génération le déclare (39acc139) |
| `V-E01-13` | Carrousel « Nouveautés » (12 produits) ; « Voir tout » → /search?sort=newest | À FAIRE | — | Aucune date de mise en ligne dans C0 — **attend GO : dégel C0 (S2) : date de mise en ligne** |
| `V-E01-15` | Chaque carrousel : flèches précédent/suivant (ordinateur, bibliothèque Embla), défilement  | PARTIEL | carrousels : similaires, récemment vus, sections éditoriales (défilement et accroche) | Flèches précédent / suivant absentes (construction prévue, sans GO) |
| `V-E01-16` | En cas d'échec de lecture de la base, la page s'affiche quand même (sections vides) | LIVRÉ | test:storefront (503 explicite sans catalogue) | Variante assumée : indisponibilité dite, jamais des sections vides |
| `V-E03-01` | Titre « Tout le catalogue » ou « Résultats pour « … » » | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-02` | Compteur « N produit(s) » ou « N résultat(s) » ; message « Aucun produit ne correspond à c | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-03` | Recherche texte (paramètre q) : cherche dans le nom du produit seulement (pas la référence | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-04` | Colonne Catégories (ordinateur) : lien « Tout le catalogue », chaque catégorie racine avec | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-05` | Catégories à sous-catégories : accordéon dépliable (chevron), lien « Tout — {catégorie} », | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-06` | Catégories sur mobile : rangée de pastilles défilantes (« Tout » + catégories racines) | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-07` | Filtre prix mini / maxi (€ HT), saisie numérique | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-09` | Bouton « Appliquer » (met les filtres dans l'adresse) ; bouton « Effacer » ; rappel des fi | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-10` | Synchronisation des filtres avec le bouton Précédent du navigateur | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-11` | Tri « Trier par » : Pertinence, Les plus populaires, Nouveautés, Prix croissant, Prix décr | PARTIEL | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs | Pertinence, prix ↑↓, nom ; « populaires » et « nouveautés » absents — **attend GO : dégel C0 : ventes, date de mise en ligne** |
| `V-E03-12` | Le tri conserve la recherche mais | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-13` | Grille de cartes produit (1/2/3 colonnes) — voir carte produit T8 | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E03-15` | Écran de chargement : squelette gris (titre + 8 tuiles) | À FAIRE | — | Squelette de chargement : seulement sur la recherche (un loading.tsx racine casse le vrai 404, constaté en I1) — construction prévue, sans GO |
| `V-E03-16` | Rafraîchissement complet des résultats quand la recherche change | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E04-01` | Titre = nom de la catégorie ; « N produits dans cette catégorie » ; message « Aucun produi | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E04-02` | Mêmes filtres prix/stock et mêmes tris que E03 (même cadre) | PARTIEL | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs | Prix et tri présents ; filtre « disponibles » absent — **attend GO : dégel C0 : stock (C15)** |
| `V-E04-03` | Page 404 si la catégorie n'existe pas | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs |  |
| `V-E04-05` | Image de partage social au nom de la catégorie | À FAIRE | — | Image de partage : décision de publication — **attend GO : domaine public + image validée** |
| `V-E05-01` | Fil d'Ariane « Accueil / {catégorie ou Catalogue} / {produit} » | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-03` | Données structurées « Fil d'Ariane » | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-06` | Grande image (5 images max), flèches précédent/suivant, vignettes cliquables ; l'image cho | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 (galerie) |  |
| `V-E05-07` | Référence affichée (référence de la variante choisie sinon du produit) | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-08` | Titre du produit | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-09` | Prix HT : fourchette « min – max » si plusieurs variantes et aucune choisie ; sinon prix d | PARTIEL | fiche existante 67b66503 ; test:storefront 25/25 | Prix de la variante choisie sur la fiche ; « à partir de » sur les cartes ; pas de fourchette min – max |
| `V-E05-11` | Courte description HTML | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-12` | Sélecteur de variantes : un groupe par axe à au moins 2 valeurs ; pastilles de couleur (35 | PARTIEL | fiche existante 67b66503 ; test:storefront 25/25 | Axes de variante publiés ; pastilles de couleur absentes (la correspondance des noms de couleurs reste à fournir) |
| `V-E05-13` | Champ Quantité (minimum = quantité minimale du produit) + message « Quantité minimale : N  | À FAIRE | — | Quantité minimale (plus petit palier publié) : construction prévue, sans GO |
| `V-E05-15` | Tableau « Tarifs dégressifs » : ligne « 1 unité », un palier par seuil (« À partir de N un | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-17` | Bouton vert « Ajouter au panier » : ajoute la variante × quantité au panier navigateur, ou | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-18` | Bouton « Demander un devis » (« Réponse sous 24h ») → fenêtre devis produit (W1) | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-E05-19` | Bouton « Mandat administratif » (« Pour les collectivités ») → fenêtre mandat (W2) | À FAIRE | — | Mandat administratif — **attend GO : paiement (C9 supplantée le 31/10)** |
| `V-E05-20` | Bouton « Ajouter au devis » / « Dans le devis ✓ » (bascule) + message « {produit} ajouté a | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Le panier tient lieu de liste de devis ; « Demander un devis » ajoute puis ouvre le devis |
| `V-E05-21` | Lien « 📄 Télécharger la fiche technique (PDF) » (nouvel onglet), avec la référence de vari | À FAIRE | — | Fiche PDF avec prix dégressifs et éco-participation — **attend GO : dégel C0 (S2 : éco-participation, documents)** |
| `V-E05-23` | « Produits similaires » : défilement horizontal de tuiles (image, titre, prix) — même caté | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E05-24` | « Récemment consultés » (si au moins 2 autres produits vus) : 8 cartes (image, titre, prix | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E05-25` | Mémorisation du produit dans « récemment consultés » (navigateur, 12 max) | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E05-27` | Version imprimable : la feuille de style d'impression masque menus, pied de page, barre co | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E05-28` | Page 404 si le produit n'existe pas ou n'est pas publié | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; JSON-LD 0e31b7ee |  |
| `V-W01-01` | Rappel produit + référence (avec la variante choisie) | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Pas de fenêtre : bouton qui ajoute au panier puis ouvre la page de devis (champs C0 : organisation, contact, e-mail, téléphone, message) |
| `V-W01-02` | Champs : Nom *, Email *, Téléphone, Quantité (préremplie avec la quantité de la fiche), Me | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Pas de fenêtre : bouton qui ajoute au panier puis ouvre la page de devis (champs C0 : organisation, contact, e-mail, téléphone, message) |
| `V-W01-03` | Bouton « Envoyer la demande » (état « Envoi... »), bouton « Annuler » | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Pas de fenêtre : bouton qui ajoute au panier puis ouvre la page de devis (champs C0 : organisation, contact, e-mail, téléphone, message) |
| `V-W01-04` | Succès : « Demande envoyée ! Nous vous répondrons dans les plus brefs délais. » + « Fermer | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Pas de fenêtre : bouton qui ajoute au panier puis ouvre la page de devis (champs C0 : organisation, contact, e-mail, téléphone, message) |
| `V-W01-05` | Erreur : « Une erreur est survenue. Veuillez réessayer ou nous contacter par téléphone. » | PARTIEL | 0e31b7ee ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Pas de fenêtre : bouton qui ajoute au panier puis ouvre la page de devis (champs C0 : organisation, contact, e-mail, téléphone, message) |
| `V-W02-01` | Rappel produit + référence ; explication du mandat ; téléphone ; lien e-mail [adresse e-ma | À FAIRE | — | Mandat administratif — **attend GO : paiement (C9 supplantée le 31/10)** |
| `V-E06-01` | Panier vide : « Votre panier est vide » + « Voir le catalogue » | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; 1e693a7a ; capture-cart.json |  |
| `V-E06-02` | Ligne : image, titre (lien vers la fiche), options de variante, prix unitaire HT « / unité | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; 1e693a7a ; capture-cart.json |  |
| `V-E06-03` | Boutons − / + quantité ; suppression de la ligne (croix). À 0, la ligne disparaît | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; 1e693a7a ; capture-cart.json |  |
| `V-E06-04` | Récapitulatif : Sous-total HT ; « Frais de livraison — À calculer » ; « TVA 20% » (calculé | À FAIRE | — | Sous-total, TVA 20 %, livraison à calculer, TTC — **attend GO : base fiscale non décidée + livraison (C1/C10)** |
| `V-E06-05` | Bouton « Finaliser la commande → » (/checkout) ; bouton « Continuer mes achats » (/search) | LIVRÉ | fiche existante 67b66503 ; test:storefront 25/25 ; 1e693a7a ; capture-cart.json |  |
| `V-E08-01` | Si le panier est vide : renvoi automatique vers /cart | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Contact C0 seulement (organisation, nom, e-mail, téléphone) |
| `V-E08-02` | Fil d'Ariane « Panier / Finaliser la commande » | LIVRÉ | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 |  |
| `V-E08-03` | Section 1 « Vos coordonnées » : Prénom *, Nom *, Nom de votre organisme *, Email *, Téléph | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Contact C0 seulement (organisation, nom, e-mail, téléphone) |
| `V-E08-04` | Section 2 « Adresse de livraison » : rue *, complément, Code postal * (5 chiffres contrôlé | À FAIRE | — | Adresse de livraison : le contrat C0 de commande n'a pas ce champ — **attend GO : dégel C0 (S1-B)** |
| `V-E08-06` | Récapitulatif : vignettes, titre, variante, quantité, total de ligne ; Sous-total HT ; TVA | À FAIRE | — | TVA et forfait de livraison sur rendez-vous (C10) — **attend GO : base fiscale non décidée (C2/C10)** |
| `V-E08-10` | Bouton « COMMANDER → » (« Traitement en cours… ») ; message d'erreur du serveur ou « Erreu | LIVRÉ | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 |  |
| `V-E08-11` | En cas de succès : passage à la confirmation avec la référence et le mode de paiement | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Référence et reçu oui ; mode de paiement non — **attend GO : paiement** |
| `V-E09-01` | Coche verte + titre « Commande enregistrée ! » (ou « Demande enregistrée » pour la carte) | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | « Commande de test enregistrée » : aucun paiement, livraison, facture ni e-mail |
| `V-E09-02` | « Référence : {numéro} » | LIVRÉ | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 |  |
| `V-E09-05` | Encadré « Une question ? » téléphone + e-mail + horaires | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 ; horaires | Horaires oui ; téléphone et e-mail non — **attend GO : coordonnées** |
| `V-E09-06` | Bouton « ← Retourner à la boutique » | LIVRÉ | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 |  |
| `V-E09-07` | Vidage automatique du panier navigateur à l'arrivée sur la page | LIVRÉ | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 |  |
| `V-E10-01` | Moins de 2 produits : « Sélectionnez au moins 2 produits pour les comparer côte à côte. »  | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E10-02` | Tableau à colonnes produits, lignes : Photo, Nom, Référence / SKU, Prix HT, Éco-participat | PARTIEL | 0e31b7ee ; capture-selection.json ; local-list / family-lookup | Colonnes famille : catégorie, référence, choix, description, prix « à partir de » ; éco-participation et fiche technique non publiées — **attend GO : dégel C0 (S2)** |
| `V-E10-03` | Mise en avant « Meilleur prix » sur le moins cher | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E10-05` | Par produit : « Voir la fiche → », « Retirer » | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E10-06` | Limite 4 produits ; page exclue de Google | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E11-01` | Colonne d'information : présentation, téléphone cliquable, e-mail cliquable, horaires, zon | PARTIEL | 1e693a7a (/contact) | Présentation, horaires, voie de devis ; ni téléphone ni e-mail — **attend GO : coordonnées** |
| `V-E12-01` | En-tête « Réponse sous 24h » / « Devis express » | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-02` | Préremplissage depuis l'adresse : ?ref= → champ Références ; ?product= → description « Je  | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-03` | Bloc « Vos coordonnées » : Prénom / Nom *, Fonction, Email *, Téléphone * | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-04` | Bloc « Votre organisme » : Type d'organisme * (10 choix), Nom de l'organisme * | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-05` | Encadré automatique « 🏛️ Chorus Pro compatible » quand le type est un organisme public (8  | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-06` | Bloc « Votre besoin » : Type de produit (8 choix), Références produits, Description du bes | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-07` | Bloc « Référence marché » : Numéro de marché public (MAPA, AO…) | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-08` | Case de consentement (contrôlée avant envoi : « Veuillez accepter les conditions avant de  | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-09` | Bouton « ENVOYER MA DEMANDE → » avec roue d'attente ; erreurs serveur ou « Erreur réseau.  | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-10` | Succès : « Demande envoyée ! Nous revenons vers vous sous 24h. », « Référence : #XXXXXXXX  | À FAIRE | — | Devis express sans produit : C0 exige au moins une ligne (`lines.length >= 1`, c0/ts/src/business.ts:135) et des clés de contact fixes — **attend GO : dégel C0 (demande sans ligne, champs d'organisme et de marché)** |
| `V-E12-11` | Rappel « Besoin urgent ? Appelez-nous : [numéro] » | À FAIRE | — | Téléphone d'urgence — **attend GO : coordonnées** |
| `V-E13-01` | 5 groupes, 15 questions en accordéon (une seule ouverte à la fois) | PARTIEL | 1e693a7a (/faq) | 7 questions sur 15 : seules les réponses décidées (C1, C3, C4, C5, C7) et la base fiscale selon la donnée |
| `V-E13-02` | Bloc « Vous ne trouvez pas la réponse ? » : téléphone cliquable + « Écrire un message → »  | PARTIEL | 1e693a7a | Lien vers /contact ; sans téléphone — **attend GO : coordonnées** |
| `V-E14-01` | Bandeau sombre « ★ Gamme exclusive PRODES » + 3 arguments (« 10 ans Garantie structure »,  | PARTIEL | 1e693a7a ; 57210fc3 | NF certifié et Chorus Pro compatible (C8) ; garantie de 10 ans non reprise (C7) |
| `V-E14-02` | Grille jusqu'à 48 produits trouvés par recherche du mot « pro-intens » (puis « pro intens  | LIVRÉ | 1e693a7a ; tests HTTP |  |
| `V-E14-03` | Compteur « N produits PRO-INTENS » | LIVRÉ | 1e693a7a ; tests HTTP |  |
| `V-E14-05` | État vide : « Gamme en cours de référencement — Les produits PRO-INTENS seront disponibles | PARTIEL | 57210fc3 | « Aucun produit de la gamme n'est publié pour le moment » : aucune promesse de date |
| `V-E15-01` | Sections : Éditeur, Hébergement, Propriété intellectuelle, Données personnelles (5 droits  | À FAIRE | — | Mentions légales : page provisoire noindex — **attend GO : texte juridique (propriétaire)** |
| `V-E15-02` | Liens e-mail et téléphone cliquables ; lien externe vers l'hébergeur | À FAIRE | — | Mentions légales : page provisoire noindex — **attend GO : texte juridique (propriétaire)** |
| `V-E18-01` | Titre « Ma sélection (N) » ; état vide « Votre sélection est vide — Cliquez sur ♥ sur n'im | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E18-02` | Grille : image, titre, « Réf : », prix normal HT, croix « Retirer des favoris » | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `V-E18-04` | À partir de 2 produits : « Ajouter tout au panier » (quantité 1 chacun, prix normal ; mess | À FAIRE | — | « Ajouter tout au panier » : pour les familles à variante unique ; construction prévue, sans GO |
| `V-E19-01` | « ⚠️ Une erreur est survenue — Nous avons été informés et allons corriger cela rapidement. | LIVRÉ | app/error.tsx existant (67b66503) | Non rejoué en I1–I4 |
| `V-E20-01` | « 404 — Cette page n'existe pas ou a été déplacée. » ; champ de recherche (→ /search?q=) ; | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json ; test:nav (vrai 404) |  |
| `V-E21-01` | Icône panier dans l'en-tête avec pastille du nombre d'articles ; clic = ouverture | LIVRÉ | 1e693a7a ; capture-cart.json |  |
| `V-E21-02` | Ouverture automatique à chaque ajout au panier | LIVRÉ | 1e693a7a ; capture-cart.json |  |
| `V-E21-03` | Panier vide : « Votre panier est vide » + « Voir le catalogue → » | LIVRÉ | 1e693a7a ; capture-cart.json |  |
| `V-E21-04` | Lignes triées par ordre alphabétique : image, titre + variante (lien vers la fiche avec la | PARTIEL | 1e693a7a ; capture-cart.json | Pas d'image par ligne (le panier du navigateur ne garde ni image ni prix) |
| `V-E21-05` | Totaux : « Total HT », « Livraison — À calculer », « Total TTC (TVA 20%) » | À FAIRE | — | Sous-total, TVA 20 %, livraison à calculer, TTC — **attend GO : base fiscale non décidée + livraison (C1/C10)** |
| `V-E21-06` | Boutons « Finaliser la commande → » (/checkout), « Voir le panier complet » (/cart) | LIVRÉ | 1e693a7a ; capture-cart.json |  |
| `V-E21-08` | Fermeture par la croix ou en cliquant à côté | LIVRÉ | 1e693a7a ; capture-cart.json |  |
| `T-T01-01` | Langue française, police Geist, titre par défaut « PRODES — Équipements pour collectivités | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Titre « Catalogue PRODES », police système (pas Geist) |
| `T-T01-02` | Description et mots-clés par défaut pour Google (« équipements collectivités », « mobilier | PARTIEL | 906f106e (OpenGraph, description sobre) | Pas de mots-clés ; le site reste noindex — **attend GO : SEO public (propriétaire)** |
| `T-T01-04` | Ordre d'affichage : en-tête → bandeau acheteur → bandeau promo → page → messages (toasts)  | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Ordre de l'ancien site non reproduit à l'identique (pas de bandeau acheteur ni promo : C12) |
| `T-T01-05` | Mémoires partagées par toutes les pages : panier, favoris, devis groupé, comparateur | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T01-06` | Mode sombre désactivé ; contour rouge PRODES au clavier ; mise en forme des descriptions p | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T01-07` | Icône d'onglet (favicon) | À FAIRE | — | Icône d'onglet à partir du logo : construction prévue, sans GO |
| `T-T02-01` | Barre rouge supérieure : téléphone cliquable « [numéro] », horaires « Lun–Sam 8h30–19h »,  | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Horaires et livraison incluse ; téléphone absent — **attend GO : coordonnées** |
| `T-T02-02` | Logo PRODES (image /logo-prodes.png) → accueil | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json |  |
| `T-T02-04` | Lien « Devis express » (grand écran) | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Lien « Demande de devis » (pas de page « devis express » : voir V-E12) |
| `T-T02-07` | Menu catégories horizontal (ordinateur) : liens lus en base (menu next-js-frontend-header- | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json |  |
| `T-T02-08` | En-tête collant en haut lors du défilement | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json |  |
| `T-T03-01` | Bouton hamburger (mobile) → panneau plein écran depuis la gauche | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Le menu « Catégories » (WAI-ARIA) remplace le tiroir plein écran |
| `T-T03-02` | Champ de recherche simple (envoie vers /search?q=, garde le mot cherché) ; version « squel | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json ; 030f6973 |  |
| `T-T03-03` | Liste des liens du menu ; fermeture par la croix, au changement de page ou si l'écran s'él | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Le menu « Catégories » (WAI-ARIA) remplace le tiroir plein écran |
| `T-T04-01` | 4 onglets fixes (mobile) : Accueil, Catalogue, Devis (→ devis express), Panier (ouvre le t | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | 4 onglets ; « Panier » mène à la page panier (le tiroir s'ouvre depuis l'en-tête) |
| `T-T04-02` | Surlignage de l'onglet actif | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json |  |
| `T-T05-01` | Suggestions dès 2 caractères, après 0,2 s de pause : jusqu'à 8 produits (image, titre, « R | PARTIEL | 030f6973 ; 98db273b | Image, nom, catégorie, prix ; pas de « Réf : » |
| `T-T05-02` | Roue d'attente, « Aucun résultat pour … », lien « Voir tous les résultats → » | LIVRÉ | 030f6973 ; 98db273b ; capture-lists.json |  |
| `T-T05-03` | Entrée = page de résultats ; croix pour effacer ; fermeture par Échap ou clic à côté | LIVRÉ | 030f6973 ; 98db273b ; capture-lists.json |  |
| `T-T06-01` | Panier conservé dans le navigateur (prodes_cart) : ajout (fusionne les mêmes variantes), + | LIVRÉ | cart-provider existant ; 1e693a7a ; capture-cart.json |  |
| `T-T08-01` | Image 4:3 avec icône de remplacement si absente ou cassée | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs ; 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T08-04` | Effet survol « Voir le produit » | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs ; 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T08-05` | Étiquette de catégorie, titre (2 lignes), prix HT / fourchette / « Sur devis » | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs ; 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T08-06` | Bouton « ⊕ Comparer » / « ✓ Comparé » (components/product/compare-button.tsx) | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs ; 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T08-07` | Cœur favoris (components/product/wishlist-button.tsx) | LIVRÉ | listes b786e2e2, f9e0fd4f ; capture-lists.json ; tests/nav/listing.test.mjs ; 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T09-01` | Bouton d'en-tête ; si vide, message « Ajoutez des produits à votre devis depuis les fiches | PARTIEL | 1e693a7a ; capture-cart.json ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Le panier et la page de devis tiennent lieu de « devis groupé » (décision de conception à valider) |
| `T-T09-02` | Pastille du nombre d'articles (« 9+ ») | LIVRÉ | 1e693a7a ; capture-cart.json (pastille du nombre de lignes) |  |
| `T-T09-03` | Fenêtre « Devis groupé — N produits » : titre (lien fiche), « Réf : », prix HT ou « Sur de | PARTIEL | 1e693a7a ; capture-cart.json ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Le panier et la page de devis tiennent lieu de « devis groupé » (décision de conception à valider) |
| `T-T09-04` | « Envoyer le devis groupé → » : n'envoie rien ; ouvre le devis express prérempli avec « De | PARTIEL | 1e693a7a ; capture-cart.json ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Le panier et la page de devis tiennent lieu de « devis groupé » (décision de conception à valider) |
| `T-T09-05` | « Vider la liste », « Continuer mes achats » | PARTIEL | 1e693a7a ; capture-cart.json ; cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Le panier et la page de devis tiennent lieu de « devis groupé » (décision de conception à valider) |
| `T-T10-01` | Dans la colonne du catalogue : champ « Entrez un SKU… », quantité, bouton « Ajouter → » | PARTIEL | 1e693a7a (commande rapide) | Ouvre la fiche avec la variante : le prix est vérifié par le serveur avant tout ajout |
| `T-T10-02` | Recherche exacte de la référence sur le serveur /api/product-by-sku (table products), ajou | PARTIEL | 1e693a7a (commande rapide) | Ouvre la fiche avec la variante : le prix est vérifié par le serveur avant tout ajout |
| `T-T11-01` | Barre fixe en bas dès qu'un produit est sélectionné : « Ajoutez au moins un autre produit  | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T11-02` | Limite « Maximum 4 produits dans le comparateur » (message d'erreur) | LIVRÉ | 0e31b7ee ; capture-selection.json ; local-list / family-lookup |  |
| `T-T13-01` | Zone de messages en bas d'écran avec bouton de fermeture (bibliothèque Sonner) — utilisée  | PARTIEL | fiche, tiroir, formulaires | Confirmations dans la page (zones annoncées) ; pas de bibliothèque de messages |
| `T-T14-01` | Logo blanc, « Au service des Collectivités », « Mobilier, signalisation et équipements pou | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json |  |
| `T-T14-02` | Liens rapides en dur : Boutique, Mobilier urbain (/search/mobilier-urbain), Signalisation  | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Liens utiles réels (catalogue, panier, devis, sélection, comparateur, gamme, FAQ, contact, mentions) |
| `T-T14-03` | Contacts : téléphone, e-mail, horaires | PARTIEL | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json | Horaires oui ; téléphone et e-mail non — **attend GO : coordonnées** |
| `T-T14-04` | Barre basse « © 2026 PRODES — Prix HT — TVA non incluse — Tous droits réservés », « Marque | PARTIEL | 39acc139 | Mention « Prix HT » seulement si la génération le déclare |
| `T-T15-01` | app/robots.ts : autorise tout sauf /admin/, /api/, /checkout/, /compare ; annonce le plan  | À FAIRE | — | robots.txt et plan du site : adresses absolues et politique d'indexation — **attend GO : domaine public + SEO (propriétaire)** |
| `T-T15-02` | app/sitemap.ts : plan du site (accueil, catalogue, devis express, FAQ, contact, mentions l | À FAIRE | — | robots.txt et plan du site : adresses absolues et politique d'indexation — **attend GO : domaine public + SEO (propriétaire)** |
| `T-T15-03` | Images de partage social générées (app/opengraph-image.tsx, components/opengraph-image.tsx | À FAIRE | — | Image de partage : décision de publication — **attend GO : domaine public + image validée** |
| `T-T15-05` | Adresse de base du site : VERCEL_PROJECT_PRODUCTION_URL sinon http://localhost:3000 (lib/u | PARTIEL | 4d72391b (SITE_PUBLIC_ORIGIN pour les canoniques éditoriaux) | Pas de base d'adresse globale |
| `T-T15-06` | Écrans de chargement : squelette du catalogue (E03) ; squelettes de cartes components/prod | À FAIRE | — | Squelette de chargement : seulement sur la recherche (un loading.tsx racine casse le vrai 404, constaté en I1) — construction prévue, sans GO |
| `T-T03-04` | Libellés pour lecteurs d'écran du menu mobile (« Open mobile menu », « Close mobile menu » | LIVRÉ | coque 906f106e ; tests/nav/shell.test.mjs ; capture-shell.json ; 030f6973 |  |
| `API-26` | Passe commande : contrôle, totaux TVA et RDV, référence, enregistrement, 2 e-mails | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Enregistrement et reçu livrés ; les 2 e-mails non — **attend GO : e-mails** |
| `API-30` | Enregistre une demande de devis produit, 2 e-mails | PARTIEL | cd7613cf, d0cd83e3 ; test:e2e:flow 8/8 | Enregistrement et reçu livrés ; les 2 e-mails non — **attend GO : e-mails** |
| `API-31` | Retrouve un produit publié par sa référence exacte | PARTIEL | 1e693a7a ; /article/<PI> | Redirection vers la fiche et recherche par référence ; pas de route JSON dédiée |
| `API-32` | Génère la fiche produit PDF A4 (prix dégressifs, éco-participation) | À FAIRE | — | Fiche PDF avec prix dégressifs et éco-participation — **attend GO : dégel C0 (S2 : éco-participation, documents)** |
| `API-33` | Jusqu'à 20 produits publiés dans l'ordre demandé (favoris, récemment vus) | LIVRÉ | 030f6973 ; 0e31b7ee ; tests HTTP |  |
| `API-35` | Recherche titre ou référence, 20 résultats avec image | LIVRÉ | 030f6973 ; 0e31b7ee ; tests HTTP |  |
| `DB-03` | Rattachement produit ↔ catégories | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-04` | Caractéristiques de déclinaison (couleur, taille, lot) | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-05` | Valeurs possibles avec pastille couleur | PARTIEL | données C0 | Valeurs d'axe oui ; pastille de couleur non |
| `DB-07` | Déclinaisons vendables (prix, stock, poids, minimum de commande) | PARTIEL | données C0 (variantes, paliers) | Pas de stock ni de poids — **attend GO : dégel C0 (S2)** |
| `DB-08` | Valeurs d'une variante | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-09` | Photos de produit ou de variante (adresses [domaine]) | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-10` | Prix dégressifs par palier (prix fixe ou remise %) | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-16` | Menus de navigation (hérité Shopify) | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `DB-17` | Liens des menus | LIVRÉ | données C0 lues par lib/site-catalog ; navigation des catégories ; test:nav, test:storefront | Remplacement Supabase par le catalogue C0 ACTIVE |
| `T-SRV-01` | Limite d'envois par adresse IP (contact, devis, recherche, PDF, suivi) | À FAIRE | — | Limite d'envois par adresse : construction prévue, sans GO (relevé par 8f sur /api/site/search) |
| `T-SRV-02` | Une ligne JSON horodatée par événement | PARTIEL | journaux de bord du site | Pas de ligne JSON horodatée systématique |
| `T-SRV-03` | Interdiction d'affichage en cadre, référent, caméra/micro coupés | LIVRÉ | proxy.ts ; test:storefront 25/25 |  |
| `T-SRV-06` | Lecture métier de la base (panier, produits, promotions, devis) et règle de prix dégressif | LIVRÉ | proxy.ts ; test:storefront 25/25 |  |
