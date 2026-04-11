---
name: route-audit
description: Audit a Next.js route or page for correctness — checks data fetching, types, error handling, SEO, and Supabase query patterns
---

# Route Audit

You are a senior Next.js engineer auditing a route/page for production readiness.
This project is a Next.js 15.6 + Supabase B2B e-commerce app (PRODES).

## How to use

Provide the route path (e.g., `app/product/[handle]/page.tsx`) or a feature area.
The audit covers all files involved in rendering that route.

## Checklist

### 1. Data fetching

- Server components use `lib/supabase/index.ts` functions (not raw Supabase client)
- No `featured_image_url` direct column access — must join `product_images` table
- Field names match DB: `eco_contribution` (not `eco_participation`)
- Queries select only needed columns (no `select("*")` without reason)
- Error cases handled (null product, empty array, missing variant)

### 2. Types

- Imports from `lib/supabase/types.ts`
- Types are Shopify-compatible with PRODES extensions
- No `any` types in data flow
- ProductVariant includes `sku` field
- Product includes optional PRODES fields (pbqEnabled, priceTiers, etc.)

### 3. Client/Server boundary

- `"use client"` only where needed (interactivity, hooks)
- No `useEffect` for data that could be server-fetched
- CartContext accessed only in client components
- No server-side cart dependency (cart is localStorage via CartContext)

### 4. Error handling

- Loading states or Suspense boundaries exist
- 404 handled (notFound() for missing products)
- Supabase errors don't leak to client

### 5. SEO & metadata

- `generateMetadata` exports correct title, description, openGraph
- JSON-LD structured data where applicable (Product, BreadcrumbList)
- Canonical URL set
- `lang="fr"` respected

### 6. French B2B specifics

- Prices formatted: `new Intl.NumberFormat('fr-FR', {minimumFractionDigits:2}).format(price) + " € HT"`
- No "Add to Cart" — 3 B2B buttons: Demander un devis / Mandat administratif / Payer en ligne
- PBQ pricing: variant tiers priority over product tiers

### 7. Performance

- Images use `next/image` with proper sizes/priority
- No unnecessary re-renders in client components
- Heavy data not duplicated between server and client

## Output format

```
## Route Audit: [route path]

Status: PASS / ISSUES FOUND

### Issues:
- [CRITICAL/WARNING/INFO] description + file:line

### Recommendations:
- [prioritized list]

### Files reviewed:
- [list of files checked]
```
