# PRODES — Rapport migration Shopify → Supabase

## Ce qui fonctionne

- **Build Next.js propre** : `npm run build` passe sans erreur TypeScript ni erreur de compilation
- **Page d'accueil** : charge les 3 produits vedettes + carousel depuis Supabase (images prodes.fr via next/image)
- **Page de recherche** `/search?q=chaise` : retourne les produits réels de la BDD (983 produits)
- **Page produit** `/product/[slug]` : retourne 200, charge le produit complet avec variantes, options, images
- **Collections** : `getCollections()` retourne les catégories Supabase comme filtres latéraux
- **Grille PBQ** : `calculatePrice()` applique les paliers fixed/percentage en priorité variant > produit
- **Panier** : `createCart`, `addToCart`, `updateCart`, `removeFromCart`, `getCart` implémentés avec Supabase
- **Menus** : `getMenu()` lit les tables `menus` + `menu_items`
- **Pages CMS** : `getPage()` / `getPages()` lisent la table `pages`
- **Types compatibles** : `lib/supabase/types.ts` exporte les mêmes types que `lib/shopify/types.ts` → aucun composant réécrit, seulement les imports changés
- **Images** : `prodes.fr` ajouté dans `next.config.ts remotePatterns`
- **Hidden collections** : `hidden-homepage-featured-items` et `hidden-homepage-carousel` retournent les 12 derniers produits

## Ce qui reste à faire

- **Checkout** : `redirectToCheckout()` redirige vers `/` (aucun vrai checkout B2B pour l'instant). À remplacer par un flow de commande custom.
- **Authentification B2B** : les prix spéciaux par client, les accès restreints, le compte utilisateur ne sont pas implémentés (prévu en phase 2 selon les specs).
- **Pagination** : `getProducts()` est limité à 250 produits (le catalogue en a 983). À implémenter pour les pages search/collection si nécessaire.
- **Sitemap complet** : le sitemap ne couvre que les 250 premiers produits.
- **SEO opengraph images** : les params de `opengraph-image.tsx` ne sont pas en Promise (Next.js 15 avertissement potentiel).
- **Menus dans Supabase** : si la table `menus` est vide, la navbar affiche 0 items. À peupler ou adapter.

## Erreurs non résolues

Aucune erreur bloquante. Le build compile sans erreur.

Avertissements non bloquants :
- `[baseline-browser-mapping] The data in this module is over two months old` → npm warning sur un package tiers, sans impact.

## Commits effectués

1. `e3b891e5` — `feat(supabase): replace Shopify with Supabase integration (étapes 1-8)`
   - Crée `lib/supabase/{client,types,price,index}.ts`
   - Remplace tous les imports `lib/shopify` par `lib/supabase` (30 fichiers)
   - Types compatibles Shopify → 0 breaking change dans les composants
   - `next.config.ts` : ajoute `prodes.fr` dans remotePatterns
   - `lib/utils.ts` : validateEnvironmentVariables pour variables Supabase

2. `a994e9d1` — `fix(supabase): fix TypeScript indexing errors in termMap`
   - Corrige les erreurs `Object is possibly 'undefined'` (strictNullChecks)
   - Build `npm run build` : ✅ succès

## Architecture lib/supabase/

```
lib/supabase/
  client.ts    → singleton Supabase createClient()
  types.ts     → types publics (Cart, Product, etc.) + types DB internes
  price.ts     → calculatePrice() — grille PBQ (fixed/percentage)
  index.ts     → toutes les fonctions exportées (getProduct, getProducts,
                  getCollections, getCollectionProducts, getMenu, getPage,
                  getPages, getCart, addToCart, updateCart, removeFromCart,
                  createCart, getProductRecommendations, revalidate)
```
