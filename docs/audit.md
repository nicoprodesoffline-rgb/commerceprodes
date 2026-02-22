# Audit visuel initial — PRODES 2026-02-21

## Pages testées

| URL | HTTP | Statut |
|-----|------|--------|
| http://localhost:3000/ | 200 | ✅ Charge produits Supabase, images prodes.fr |
| http://localhost:3000/search | 200 | ✅ Grille produits visible |
| http://localhost:3000/search?q=chaise | 200 | ✅ Résultats réels (chaise-pliante-melilla-…) |
| http://localhost:3000/product/panneau-electoral-1-candidat | 200 | ✅ Produit simple + PBQ |
| http://localhost:3000/product/arceau-espace-vert | 200 | ✅ Produit variable (variants Ø20/Ø32/Ø50) |

## Slugs réels utilisés

- **Simple + PBQ** : `panneau-electoral-1-candidat` (SKU ALTPE1, 199,31 € HT)
- **Variable + PBQ** : `arceau-espace-vert` (SKU MOAEV1, depuis 53,77 €)
- **Avec éco-participation** : `table-ronde-diametre-150cm-pro-intens-8-10-places` (éco: 2,56 €)

## Problèmes identifiés (à corriger dans les étapes suivantes)

1. **Prix affiché en USD format** : Le composant `Price` affiche "€" mais avec `Intl.NumberFormat(undefined, {style:'currency'})` → format dépend de la locale navigateur, pas "fr-FR" → à corriger en format fixe "X,XX € HT"
2. **Prix carte produit** : Affiche seulement `regular_price` du produit parent, pas la plage des variants → "0,00 €" pour produits sans regular_price
3. **Bouton "Add To Cart"** : Shopify UX, à remplacer par les 3 modes de commande B2B
4. **"Related Products"** : Label anglais, à passer en "Produits similaires"
5. **Menu navbar vide** : table `menus` vide → navbar sans liens catégories
6. **VariantSelector** : Labels en majuscules anglaises, à franciser
7. **Aucun tableau PBQ** : Les paliers de prix ne sont pas affichés
8. **Pas de SKU visible** sur la fiche produit

## Données Supabase confirmées

- 983 produits (status=publish)
- price_tiers avec type `fixed` (colonne `price`) et `percentage` (colonne `discount_percent`)
- eco_contribution sur certains produits (table-ronde, pack-chaises, etc.)
- Catégories hiérarchiques (parent_id IS NULL = catégories principales)
- Table `menus` vide → à peupler depuis les catégories
