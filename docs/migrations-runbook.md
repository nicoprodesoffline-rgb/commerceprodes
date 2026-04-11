# Runbook Migrations SQL — PRODES Commerce

## État actuel connu

- `001` à `008` : appliquées `a priori` côté projet historique, à vérifier en base avant toute relance
- `009` : appliquée hors repo actuel, liée à `customer_accounts`, à vérifier en base si besoin
- `010` à `015` : absentes du repo courant
- `016`, `017`, `018`, `019`, `021` : présentes dans ce repo, à vérifier puis appliquer dans cet ordre si elles manquent
- `020` : absente du repo courant

## Migrations par ordre

### 001 — abandoned-carts

**Tables :** `abandoned_carts`  
**Statut :** À appliquer si la table n'existe pas  
**Ordre :** Première brique autonome  
**Vérification :** `SELECT to_regclass('public.abandoned_carts');`

### 002 — category-cover

**Tables modifiées :** `categories`  
**Changements :** ajout de `cover_image_url`  
**Statut :** Optionnel si la colonne existe déjà  
**Ordre :** Après `001`, indépendant du reste  
**Vérification :**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'categories' AND column_name = 'cover_image_url';
```

### 003 — shared-carts

**Tables :** `shared_carts`  
**Statut :** À appliquer si le partage panier est utilisé  
**Ordre :** Après `001`, indépendant du reste  
**Vérification :** `SELECT to_regclass('public.shared_carts');`

### 004 — homepage-sections

**Tables :** `homepage_sections`  
**Statut :** À appliquer si la homepage dynamique est activée  
**Ordre :** Indépendant  
**Vérification :** `SELECT to_regclass('public.homepage_sections');`

### 005 — competitive-watch

**Tables :** `competitor_prices`  
**Statut :** À appliquer si la veille concurrentielle est utilisée  
**Ordre :** Indépendant  
**Vérification :** `SELECT to_regclass('public.competitor_prices');`

### 006 — import-logs

**Tables :** `import_logs`  
**Statut :** Recommandée pour le backoffice import / data factory  
**Ordre :** Avant tout usage des logs d'import  
**Vérification :** `SELECT to_regclass('public.import_logs');`

### 007 — analytics

**Tables :** `product_views`, `cart_events`  
**Statut :** Recommandée si les dashboards analytics sont utilisés  
**Ordre :** Avant les endpoints analytics  
**Vérification :**

```sql
SELECT to_regclass('public.product_views') AS product_views,
       to_regclass('public.cart_events') AS cart_events;
```

### 008 — site-config

**Tables :** `site_config`, `testimonials`  
**Statut :** Recommandée pour le backoffice contenu/config  
**Ordre :** Après `004` si homepage pilotée en base, sinon indépendant  
**Vérification :**

```sql
SELECT to_regclass('public.site_config') AS site_config,
       to_regclass('public.testimonials') AS testimonials;
```

### 016 — product-families

**Tables :** `product_families`, `product_family_members`, `product_family_candidates`  
**Tables modifiées :** `products` (`family_role`, `parent_family_id`)  
**Statut :** À appliquer pour `/admin/familles` et l'assemblage mère/filles  
**Ordre :** Avant `018` et `019`  
**Vérification :**

```sql
SELECT to_regclass('public.product_families') AS product_families,
       to_regclass('public.product_family_members') AS product_family_members,
       to_regclass('public.product_family_candidates') AS product_family_candidates;
```

### 017 — product-commercial-fields

**Tables modifiées :** `variants`, `products`  
**Changements :** champs logistiques/commerciaux variantes + `parent_sku` + `default_attribute_values`  
**Statut :** À appliquer pour les workflows variantes avancés  
**Ordre :** Après `016` recommandé, avant `018`  
**Vérification :**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'variants'
  AND column_name IN ('supplier_ref', 'supplier_name', 'quantity_rules_enabled', 'eco_contribution');
```

### 018 — lot-pricing-engine

**Tables :** `product_pricing_profiles`, `product_lot_offers`, `variant_pricing_profiles`  
**Statut :** À appliquer pour la couche lot/pricing non explosive  
**Ordre :** Après `016` et `017`  
**Vérification :**

```sql
SELECT to_regclass('public.product_pricing_profiles') AS product_pricing_profiles,
       to_regclass('public.product_lot_offers') AS product_lot_offers,
       to_regclass('public.variant_pricing_profiles') AS variant_pricing_profiles;
```

### 019 — commercial-pricing-governance

**Tables :** `product_promotion_layers`, `pricing_attribute_rules`  
**Statut :** À appliquer pour la gouvernance promo + attributs impact prix  
**Ordre :** Après `018`  
**Vérification :**

```sql
SELECT to_regclass('public.product_promotion_layers') AS product_promotion_layers,
       to_regclass('public.pricing_attribute_rules') AS pricing_attribute_rules;
```

### 021 — puid-identity

**Tables modifiées :** `products`, `variants`  
**Changements :** colonnes `puid`, `puid_root`, `puid_price_branch`, `puid_style_branch`, `puid_generated_at`  
**Statut :** À appliquer pour l'identité PUID et les outils data factory  
**Ordre :** Après `016` et `017`, peut être appliquée indépendamment de `018`/`019` si seul le PUID est nécessaire  
**Vérification :**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('puid', 'puid_root', 'puid_price_branch', 'puid_style_branch');
```

## Ordre d'application recommandé

1. `001` → `008` si environnement vierge
2. `016`
3. `017`
4. `018`
5. `019`
6. `021`

## Migrations absentes du repo

- `009` : connue historiquement pour `customer_accounts`, non présente dans `docs/sql-migrations/`
- `010` à `015` : non présentes
- `020` : non présente

## Vérification rapide globale

```sql
SELECT
  to_regclass('public.abandoned_carts') AS m001,
  to_regclass('public.shared_carts') AS m003,
  to_regclass('public.homepage_sections') AS m004,
  to_regclass('public.competitor_prices') AS m005,
  to_regclass('public.import_logs') AS m006,
  to_regclass('public.product_views') AS m007_product_views,
  to_regclass('public.cart_events') AS m007_cart_events,
  to_regclass('public.site_config') AS m008_site_config,
  to_regclass('public.testimonials') AS m008_testimonials,
  to_regclass('public.product_families') AS m016,
  to_regclass('public.product_pricing_profiles') AS m018,
  to_regclass('public.product_promotion_layers') AS m019;
```
