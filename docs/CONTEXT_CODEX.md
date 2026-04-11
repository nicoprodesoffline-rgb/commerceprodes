# Contexte Codex — PRODES Commerce

_À lire impérativement avant chaque session._

---

## Stack technique

- **Framework :** Next.js 15.6 (App Router, Turbopack, PPR)
- **DB :** Supabase (PostgreSQL), client `lib/supabase/client.ts`
- **Langage :** TypeScript strict (0 erreurs attendues)
- **Styles :** Tailwind CSS
- **Email :** Resend via `lib/email/sender.ts` (dégradé si RESEND_API_KEY absente)
- **Tests :** aucun pour l'instant — **chaque session doit finir par `tsc --noEmit`**

## Repos

- **Repo actif :** `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- **NE PAS toucher :** `/Users/nico/Desktop/commerce` (archivé, fork original)

## État du build

- **Build :** 78/78 pages ✅ (vérifier après chaque session)
- **tsc :** 0 erreurs ✅ (hors lib/shopify/index.ts qui est un fichier mort)

---

## Règles impératives

### Avant de toucher la DB

- **TOUJOURS** utiliser `dry_run=true` en premier
- **TOUJOURS** créer un backup avant apply PUID (`/api/admin/data-factory/puid/backup`)
- Ne jamais `ALTER TABLE` sans migration SQL dans `docs/sql-migrations/`

### TypeScript

- **JAMAIS** `as any` — utiliser les types appropriés ou créer de nouveaux types
- **JAMAIS** `parseInt(x)` sans radix → `parseInt(x, 10)`
- **TOUJOURS** vérifier `response.ok` après `fetch()` et `adminFetch()`
- **TOUJOURS** typer les paramètres de fonction explicitement

### Routes admin

- **TOUJOURS** `checkAdminAuth(request)` en première ligne
- Pattern Bearer token OU cookie `admin_session`
- Utiliser `safeError(err)` pour les messages d'erreur (anti-fuite en prod)
- Rate limiting déjà géré par middleware Edge — pas besoin de rate limit inline

### Composants React

- **TOUJOURS** dégrader gracieusement si une migration est absente
- Utiliser `checkFamiliesDb()` / `checkVariationsDb()` avant les ops sur familles
- Pas de useEffect pour les mutations — utiliser server actions ou route handlers

---

## Patterns attendus

### Auth route admin

```ts
import { checkAdminAuth } from "@/lib/admin/auth";
import { safeError } from "@/lib/admin/security";

export async function POST(request: Request) {
  if (!checkAdminAuth(request)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    // ...
  } catch (err) {
    return Response.json({ error: safeError(err) }, { status: 500 });
  }
}
```

### Fetch admin côté client

```ts
import { adminFetch } from "@/lib/admin/fetch";

const res = await adminFetch("/api/admin/...", {
  method: "POST",
  body: JSON.stringify(data),
});
if (!res.ok) {
  const err = await res.json();
  throw new Error(err.error || "Erreur serveur");
}
const json = await res.json();
```

### Dégradation migration absente

```ts
import { checkFamiliesDb } from "@/lib/admin/families-db";

const dbStatus = await checkFamiliesDb();
if (!dbStatus.familiesReady) {
  return Response.json(
    { error: "MIGRATION_REQUIRED", migration: "016" },
    { status: 503 },
  );
}
```

---

## Base de données — colonnes clés

### Table `products`

```
id, sku, slug, name, description, regular_price, sale_price,
stock_status, pbq_enabled, pbq_pricing_type, eco_contribution,
weight, length, width, height, seo_title, seo_description, tags,
family_role, parent_family_id, parent_sku, default_attribute_values,
puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at
```

### Table `variants`

```
id, product_id, sku, name, regular_price, sale_price, stock_status,
min_order_quantity, status, position,
gtin_upc_ean_isbn, tax_class_override, active_flag,
min_quantity, max_quantity, group_of_quantity, stock_multiplier,
initial_stock, supplier_ref, supplier_name, supplier_purchase_price,
eco_contribution, puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at
```

### Colonnes qui N'EXISTENT PAS (pièges)

- ❌ `featured_image_url` sur products → joindre `product_images`
- ❌ `eco_participation` → c'est `eco_contribution`

### Migrations à appliquer en Supabase (si pas encore fait)

Dans l'ordre : 016 → 017 → 018 → 019 → 021

---

## Architecture PUID

Format : `P-{SUP}-{MODEL}-{PRICE_BRANCH}.{STYLE_BRANCH}`

- `SUP` : 3 lettres fournisseur (GMC, ESU, BEN, SOC, MOT...)
- `MODEL` : référence racine stable (pas de mots génériques comme TABLE, GAMME)
- `PRICE_BRANCH` : attributs qui changent le prix (norme, dimension, finition technique)
- `STYLE_BRANCH` : attributs décoratifs (coloris, piètement décoratif)
- Point `.` sépare les deux branches

Produit parent : PUID = `puid_root` seulement
Variant : PUID complet avec branches

---

## Familles produits

- `product_families` : la famille (nom, strategy)
- `product_family_members` : lien produit/variant ↔ famille (exclusif)
- `family_role` sur products : `parent` | `child` | `standalone`
- Une mère = product avec `family_role = 'parent'`
- Les enfants sont exclus du search et du catalogue (redirect 301 → mère)

---

## Fichiers clés

```
lib/supabase/index.ts       → toutes les fonctions data (getProduct, getProducts...)
lib/supabase/types.ts       → types Shopify-compatibles + extensions PRODES
lib/supabase/price.ts       → calculatePrice() pour PBQ
lib/admin/puid.ts           → buildPuidPlan(), loadPuidInput()
lib/admin/families-db.ts    → checkFamiliesDb(), checkVariationsDb()
lib/admin/auth.ts           → checkAdminAuth()
lib/admin/security.ts       → safeError(), rate limiting
lib/email/sender.ts         → sendEmail() + 4 templates HTML
```

---

## Fin de session — Checklist obligatoire

```bash
cd /Users/nico/Desktop/prodes_newsite_codex/commerce
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
node ./node_modules/.bin/tsc --noEmit
```

- [ ] tsc : 0 erreurs (hors lib/shopify)
- [ ] Build fonctionne (optionnel si pas de nouveau composant)
- [ ] `docs/morning-report-XX.md` mis à jour avec ce qui a été fait
- [ ] Handoff `state/handoff.json` mis à jour

---

## Architecture Canonical Product Model (décisions 2026-03-18)

Documents de référence :

- `docs/CANONICAL_PRODUCT_MODEL.md` — architecture complète, décisions, flux
- `docs/SCHEMA_AUDIT.md` — audit schema Supabase vs format Retab expanded
- `docs/JLO/questions-integration-prodes.md` — questionnaire intégration JLogiciels

### Décisions clés

1. **Attributs = JSONB hybride** : `variants.attributs_prix JSONB` remplace le système EAV 4 tables. `attribute_registry` = référentiel consultatif seulement.
2. **Pricing par branche** : le prix se définit au niveau de la combinaison des axes_prix, pas par variante individuelle. `product_pricing_profiles.price_branch JSONB`.
3. **Lots hybride** : dégressif = paliers natifs JLogiciels. Flat (X+Y offerts) = articles projetés avec multiplicateur stock.
4. **Front-end = Supabase uniquement**. `lib/shopify/` = code mort.
5. **Désignation JLogiciels** : jamais de nom fournisseur (visible sur devis clients). Champ Famille JLO = nom du produit mère.

### Règles pour Codex

- **Ne pas créer de variantes "lot"** dans Supabase → les lots sont des pricing rules
- **Ne pas toucher les tables EAV** (`attribute_terms`, `product_attributes`, `variant_attributes`) → elles seront supprimées
- **Utiliser `attributs_prix JSONB`** sur les variantes pour les attributs (quand la migration sera faite)

---

## APIs tierces validées

Avant d'implémenter une intégration externe, consulter :

- `docs/PUBLIC_APIS_REFERENCE.md` — liste technique complète par phase roadmap (env vars, endpoints, contraintes)
- `docs/API_RADAR.md` — décisions stratégiques, analyse ScraperAPI vs Retab, ordre d'intégration

Règle : **ne pas intégrer une API avant que sa phase roadmap soit ouverte (`timing = now`).**

---

_Document maintenu par Claude. Dernière mise à jour : 2026-03-18_
