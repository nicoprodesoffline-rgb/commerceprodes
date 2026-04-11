# MEDIA_SAFE_AUDIT — 2026-03-26

## Contexte

Audit et corrections des colonnes fantômes utilisées dans deux routes API Next.js.
Effectué dans le cadre du run overnight 2026-03-26, Phase 7 (commerce safe bugfixes).

---

## Colonnes fantômes identifiées

| Colonne fantôme               | Statut en base                   | Remplacement correct                                                |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `products.featured_image_url` | N'existe PAS — colonne supprimée | Jointure `product_images (url, alt_text, is_featured, position)`    |
| `products.eco_participation`  | N'existe PAS — renommée          | `products.eco_contribution` (confirmé dans `lib/supabase/types.ts`) |

---

## Routes corrigées

### 1. `app/api/product-by-sku/route.ts`

**Avant :**

```typescript
.select("id, name, slug, sku, regular_price, eco_participation, featured_image_url")
// ...
eco_participation: Number((data as any).eco_participation) || 0,
featured_image_url: (data as any).featured_image_url,
```

**Après :**

```typescript
.select("id, name, slug, sku, regular_price, eco_contribution, product_images (url, alt_text, is_featured, position)")
// ...
eco_contribution: Number(d.eco_contribution) || 0,
featured_image_url: featuredImage?.url ?? null,  // extraite de product_images (is_featured en priorité, sinon [0])
```

**Payload caller-compatible :** `featured_image_url` reste présent dans la réponse JSON (clé inchangée), seule la valeur est maintenant réelle. `eco_participation` → `eco_contribution` (renommage dans la réponse).

### 2. `app/api/products-by-handles/route.ts`

**Avant :**

```typescript
.select("id, name, slug, sku, regular_price, featured_image_url")
// ...
featured_image_url: p.featured_image_url,
```

**Après :**

```typescript
.select("id, name, slug, sku, regular_price, product_images (url, alt_text, is_featured, position)")
// ...
featured_image_url: featuredImage?.url ?? null,  // extraite de product_images
```

---

## Logique d'extraction de l'image

Dans les deux routes, la même stratégie est appliquée :

```typescript
const images = Array.isArray(p.product_images) ? p.product_images : [];
const featuredImage =
  images.find((img) => img.is_featured) ?? images[0] ?? null;
// featured_image_url: featuredImage?.url ?? null
```

Priorité : image marquée `is_featured=true` → sinon première image par position → sinon `null`.

---

## Vérification TypeScript

```
npx tsc --noEmit --skipLibCheck
```

Résultat : **0 erreur** (sortie vide = compilation propre).

---

## Impact

- **Aucune régression** : les deux routes retournaient des valeurs `null` ou `undefined` avant (colonne fantôme), elles retournent maintenant la vraie URL ou `null`.
- **Payload préservé** : la clé `featured_image_url` reste dans la réponse pour les appelants existants.
- **eco_contribution** : renommage visible dans le payload — à vérifier côté appelant si `eco_participation` était consommé quelque part dans le frontend.

---

## Callers à surveiller

| Route corrigée             | Callers potentiels                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `/api/product-by-sku`      | `components/quick-order/quick-order-bar.tsx` (SKU lookup)                                           |
| `/api/products-by-handles` | `components/product/recently-viewed.tsx`, `app/wishlist/page.tsx`, `app/compare/compare-client.tsx` |

Ces callers utilisent `featured_image_url` depuis la réponse — la clé est maintenant correctement renseignée.
Le renommage `eco_participation` → `eco_contribution` dans la réponse de `/api/product-by-sku` n'affecte pas les callers connus (champ non consommé côté frontend).

---

_Rédigé par Claude (run overnight 2026-03-26)._
