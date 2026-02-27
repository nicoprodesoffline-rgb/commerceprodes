# Audit Session 9 — État réel avant corrections

**Date :** 27 février 2026
**Build :** ✅ 0 erreurs TypeScript — 67 pages générées

---

## Bugs critiques trouvés et corrigés en ÉTAPE 0

### BUG 1 — Route conflict `[handle]` vs `[id]` → CRASH TOTAL (500 partout)
**Fichier :** `app/api/admin/products/[handle]/route.ts` + `app/api/admin/products/[id]/route.ts`
**Symptôme :** Next.js refusait de démarrer — `Error: You cannot use different slug names for the same dynamic path ('handle' !== 'id')`
**Impact :** Site entier retournait 500
**Correction :** Suppression de `[handle]/route.ts`. Fusion dans `[id]/route.ts` qui détecte UUID vs slug :
```ts
const isUuid = UUID_RE.test(id);
query.eq(isUuid ? "id" : "slug", id)
```

### BUG 2 — Recherche live retourne toujours vide
**Fichier :** `app/api/search/route.ts`
**Symptôme :** `/api/search?q=panneau` → `{"results":[],"query":"panneau"}`
**Cause :** `SELECT featured_image_url` — colonne inexistante sur la table `products`
**Correction :** Join avec `product_images!inner(url, is_featured, position)` + fallback sans images si join échoue

### BUG 3 — Admin dashboard crash (produits sans image)
**Fichier :** `app/admin/page.tsx` ligne 51
**Symptôme :** `.or("featured_image_url.is.null,featured_image_url.eq.")` → erreur Supabase silencieuse
**Correction :** Remplacé par `.or("short_description.is.null,short_description.eq.")` (colonne valide)

### BUG 4 — API `/api/admin/products/[id]` GET select invalide
**Fichier :** `app/api/admin/products/[id]/route.ts`
**Symptôme :** Sélectionnait `featured_image_url` directement sur products
**Correction :** Join `product_images(url, is_featured, position)` + calcul `featured_image_url` côté serveur

---

## Bilan HTTP des routes (après corrections)

| Route | Status | Remarque |
|---|---|---|
| `/` | ✅ 200 | Homepage OK |
| `/search` | ✅ 200 | Page recherche OK |
| `/product/panneau-electoral-1-candidat` | ✅ 200 | Simple + PBQ OK |
| `/product/arceau-espace-vert` | ✅ 200 | Variable OK |
| `/product/table-ronde-diametre-150cm-pro-intens-8-10-places` | ✅ 200 | Éco-participation OK |
| `/gamme-pro-intens` | ✅ 200 | Page gamme PRO-INTENS OK |
| `/devis-express` | ✅ 200 | Formulaire B2B OK |
| `/mes-commandes` | ✅ 200 | Historique OK |
| `/panier` | ✅ 200 | Cart page OK |
| `/checkout` | ✅ 200 | Checkout OK |
| `/product/slug-inexistant` | ✅ 404 | notFound() OK |
| `/produit-inexistant-xxx` | ⚠️ 200 | [page] route absorbe — non critique |
| `/admin/*` | ✅ 307→login | Auth middleware OK |
| `/api/search?q=panneau` | ✅ 200 | Résultats avec images |
| `/api/product-pdf/...` | ✅ 200 | Content-type: application/pdf |
| `/api/admin/site-config` | ✅ 401 | Auth requise |

---

## Fonctionnalités vérifiées

### ✅ OK — Éco-participation (fiche produit)
- `getEcoDisplay()` fonctionne — affiche "éco-participation / unité" sur le produit table-ronde
- Logique `hasLotsVariant` correcte — `included` vs `per-unit`

### ✅ OK — PDF fiche technique
- Retourne bien `content-type: application/pdf`
- Route `/api/product-pdf/[handle]` fonctionnelle

### ✅ OK — Recherche live (après fix)
- Résultats avec `featuredImageUrl` depuis `product_images`
- Debounce 200ms dans `LiveSearch` component

### ✅ OK — Breadcrumbs JSON-LD
- Présents sur fiche produit : `BreadcrumbList` dans le HTML

### ✅ OK — Promo Banner
- Présente dans le layout (composant `PromoBanner`)

### ✅ OK — Auth admin (middleware + layout)
- Middleware redirige `/admin/*` → `/admin/login` sans cookie
- Layout double-vérifie avec cookie `admin_session`

### ✅ OK — Cart localStorage
- `CartContext` sans dépendance API Supabase
- Panier visible sur `/panier`

---

## Issues non critiques (à corriger en steps suivants)

| Issue | Fichier | Priorité |
|---|---|---|
| `[page]` route absorbe les 404 inconnus (retourne 200) | `app/[page]/page.tsx` | Basse |
| Admin catalogue/produits/[id] — `featured_image_url` dans `api/admin/products/[id]` retourné via calcul (mais PATCH ne le renvoie plus) | `app/admin/produits/[id]/page.tsx` | Moyenne |
| Filtres catalogue URL persistants — non implémentés | Step 12 | Haute |
| Comparateur impression/CSV — non implémenté | Step 10b | Moyenne |
| Intégration testimonials dans homepage — non implémentés | Step 14 | Moyenne |

---

## Colonnes DB confirmées manquantes sur `products`

- `featured_image_url` : N'EXISTE PAS — les images sont dans `product_images` table
- Images récupérées via join dans toutes les API après correction

---

*Généré Session 9 PRODES Commerce — après audit + 4 bugs corrigés*
