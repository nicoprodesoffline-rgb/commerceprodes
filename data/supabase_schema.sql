-- ============================================================
-- PRODES B2B E-Commerce — Schéma Supabase
-- Généré le 2026-02-20
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================
-- Ordre de création (respecte les dépendances) :
--  1. ENUMs
--  2. categories
--  3. products
--  4. product_categories
--  5. attributes + attribute_terms + product_attributes
--  6. variants + variant_attributes
--  7. product_images  (refs products ET variants)
--  8. price_tiers     (refs products ET variants)
--  9. carts + cart_items
-- 10. menus + menu_items
-- 11. pages
-- 12. INDEX
-- 13. TRIGGERS updated_at
-- ============================================================


-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE product_type   AS ENUM ('simple', 'variable');
CREATE TYPE product_status AS ENUM ('publish', 'draft', 'private');
CREATE TYPE stock_status   AS ENUM ('instock', 'outofstock', 'onbackorder');
CREATE TYPE pbq_type       AS ENUM ('fixed', 'percentage');


-- ============================================================
-- 1. CATÉGORIES  (hiérarchiques, remplace Collections Shopify)
-- ============================================================

CREATE TABLE categories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       uuid        REFERENCES categories(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  slug            text        UNIQUE NOT NULL,
  description     text,
  seo_title       text,
  seo_description text,
  image_url       text,
  position        integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE categories IS
  'Catégories WooCommerce hiérarchiques (tax:product_cat). Remplace les Collections Shopify.';


-- ============================================================
-- 2. PRODUITS  (simples + parents des variables)
-- ============================================================

CREATE TABLE products (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiants
  sku                 text           UNIQUE NOT NULL,
  slug                text           UNIQUE NOT NULL,   -- post_name → URL /product/[slug]
  name                text           NOT NULL,          -- post_title
  description         text,                             -- post_content (HTML nettoyé)
  short_description   text,                             -- post_excerpt

  -- Type et statut
  type                product_type   NOT NULL DEFAULT 'simple',
  status              product_status NOT NULL DEFAULT 'publish',
  featured            boolean        NOT NULL DEFAULT false,

  -- Tarification de base (les variations écrasent ces valeurs)
  regular_price       numeric(10,2),
  sale_price          numeric(10,2),
  sale_price_start    date,
  sale_price_end      date,

  -- Stock
  stock_quantity      integer,
  stock_status        stock_status   NOT NULL DEFAULT 'instock',
  manage_stock        boolean        NOT NULL DEFAULT false,
  backorders_allowed  boolean        NOT NULL DEFAULT false,
  low_stock_threshold integer,
  sold_individually   boolean        NOT NULL DEFAULT false,

  -- Dimensions / Expédition
  weight              numeric(8,3),   -- kg
  length              numeric(8,2),   -- cm
  width               numeric(8,2),   -- cm
  height              numeric(8,2),   -- cm

  -- Taxe
  tax_status          text           NOT NULL DEFAULT 'taxable',
  tax_class           text           NOT NULL DEFAULT '',

  -- Fournisseur (B2B interne)
  supplier_code       text,           -- meta:fournisseur        ex: 'GMCE'
  supplier_ref        text,           -- meta:ref_fournisseur
  supplier_price      numeric(10,2),  -- meta:prix_achat_fournisseur
  eco_contribution    numeric(8,2),   -- meta:eco_part (éco-participation)

  -- Configuration grille de prix PBQ
  pbq_enabled         boolean        NOT NULL DEFAULT false,
  pbq_pricing_type    pbq_type,      -- 'fixed' = prix unitaire / 'percentage' = remise %
  pbq_min_quantity    integer        NOT NULL DEFAULT 1,
  pbq_max_quantity    integer,

  -- SEO
  seo_title           text,          -- meta:_yoast_wpseo_title
  seo_description     text,          -- meta:_yoast_wpseo_metadesc
  tags                text[]         NOT NULL DEFAULT '{}',  -- tax:product_tag

  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  products              IS 'Produits simples et parents des produits variables.';
COMMENT ON COLUMN products.slug         IS 'Slug URL unique (post_name WooCommerce).';
COMMENT ON COLUMN products.description  IS 'HTML nettoyé — sans données Elementor.';
COMMENT ON COLUMN products.pbq_enabled  IS 'True si une grille de prix par quantité est active sur ce produit.';


-- ============================================================
-- 3. TABLE PIVOT  products ↔ categories  (many-to-many)
-- ============================================================

CREATE TABLE product_categories (
  product_id  uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);


-- ============================================================
-- 4. ATTRIBUTS GLOBAUX  (pa_couleurs, pa_taille, pa_dimension…)
-- ============================================================

CREATE TABLE attributes (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug     text    UNIQUE NOT NULL,  -- ex: 'couleurs', 'taille', 'les-lots'
  name     text    NOT NULL,         -- ex: 'Couleurs', 'Taille', 'Lot'
  type     text    NOT NULL DEFAULT 'select',  -- 'select' | 'color' | 'text'
  position integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE attributes IS
  'Attributs globaux WooCommerce (pa_*). Équivalent des Options Shopify.';


-- ============================================================
-- 5. VALEURS D'ATTRIBUTS  (rouge, bleu, M, L, XL…)
-- ============================================================

CREATE TABLE attribute_terms (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid    NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  slug         text    NOT NULL,   -- ex: 'rouge', 'xl'
  name         text    NOT NULL,   -- ex: 'Rouge', 'XL'
  color_code   text,               -- hex pour les swatches couleur ex: '#FF0000'
  position     integer NOT NULL DEFAULT 0,
  UNIQUE (attribute_id, slug)
);


-- ============================================================
-- 6. ATTRIBUTS PAR PRODUIT  (lesquels + créent des variations ?)
-- ============================================================

CREATE TABLE product_attributes (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid     NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  attribute_id uuid     NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  terms        text[]   NOT NULL DEFAULT '{}',  -- slugs des valeurs ex: ['rouge','bleu']
  is_visible   boolean  NOT NULL DEFAULT true,   -- affiché sur la fiche produit
  is_variation boolean  NOT NULL DEFAULT false,  -- génère des variations
  default_term text,                             -- valeur sélectionnée par défaut
  UNIQUE (product_id, attribute_id)
);


-- ============================================================
-- 7. VARIATIONS  (enfants des variables + variante "défaut" des simples)
-- ============================================================

CREATE TABLE variants (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid           NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  sku                text           UNIQUE NOT NULL,
  name               text           NOT NULL,  -- ex: 'Rouge / L' ou 'Default'
  description        text,                     -- meta:_variation_description

  -- Tarification (NULL = hérite du produit parent)
  regular_price      numeric(10,2),
  sale_price         numeric(10,2),

  -- Stock (NULL = hérite du produit parent)
  stock_quantity     integer,
  stock_status       stock_status   NOT NULL DEFAULT 'instock',
  manage_stock       boolean        NOT NULL DEFAULT false,

  -- Dimensions (NULL = hérite du produit parent)
  weight             numeric(8,3),
  length             numeric(8,2),
  width              numeric(8,2),
  height             numeric(8,2),

  -- B2B
  min_order_quantity integer        NOT NULL DEFAULT 1,

  status             product_status NOT NULL DEFAULT 'publish',
  position           integer        NOT NULL DEFAULT 0,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  variants                    IS 'Variations WooCommerce + variante unique "Default" pour les produits simples.';
COMMENT ON COLUMN variants.regular_price      IS 'NULL = hérite de products.regular_price.';
COMMENT ON COLUMN variants.min_order_quantity IS 'Quantité minimale de commande (B2B).';


-- ============================================================
-- 8. VALEURS D'ATTRIBUTS PAR VARIATION
-- ============================================================

CREATE TABLE variant_attributes (
  variant_id   uuid NOT NULL REFERENCES variants(id)   ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  term_slug    text NOT NULL,  -- ex: 'rouge', 'xl'
  PRIMARY KEY (variant_id, attribute_id)
);


-- ============================================================
-- 9. IMAGES  (produit OU variation)
-- ============================================================

CREATE TABLE product_images (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid    REFERENCES products(id) ON DELETE CASCADE,
  variant_id  uuid    REFERENCES variants(id) ON DELETE CASCADE,
  url         text    NOT NULL,           -- URL WooCommerce prodes.fr/wp-content/uploads/…
  alt_text    text    NOT NULL DEFAULT '',
  title       text    NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,  -- première image = image principale

  CONSTRAINT image_target_check CHECK (
    product_id IS NOT NULL OR variant_id IS NOT NULL
  )
);

COMMENT ON TABLE  product_images     IS 'Images WooCommerce (1-9 par produit). URLs conservées en phase 1, migration vers Supabase Storage en phase 2.';
COMMENT ON COLUMN product_images.url IS 'Format source: https://prodes.fr/wp-content/uploads/YYYY/MM/image.jpg';


-- ============================================================
-- 10. GRILLES DE PRIX B2B  (plugin PBQ WooCommerce)
-- ============================================================

CREATE TABLE price_tiers (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid         REFERENCES products(id) ON DELETE CASCADE,
  variant_id       uuid         REFERENCES variants(id) ON DELETE CASCADE,

  -- Palier : à partir de min_quantity unités, ce prix/remise s'applique
  min_quantity     integer      NOT NULL CHECK (min_quantity >= 1),

  -- Valeur du palier (selon pbq_pricing_type du produit parent) :
  price            numeric(10,2),          -- 'fixed'      : prix unitaire HT à ce palier
  discount_percent numeric(5,2),           -- 'percentage' : % de remise sur regular_price

  position         integer      NOT NULL DEFAULT 0,  -- ordre d'affichage

  CONSTRAINT tier_target_check CHECK (
    product_id IS NOT NULL OR variant_id IS NOT NULL
  ),
  CONSTRAINT tier_value_check CHECK (
    price IS NOT NULL OR discount_percent IS NOT NULL
  )
);

COMMENT ON TABLE  price_tiers              IS 'Paliers de prix par quantité (PBQ). Premier palier sans remise non inséré (prix de base sur product/variant).';
COMMENT ON COLUMN price_tiers.product_id   IS 'Palier au niveau produit (s''applique à toutes les variations non overridées).';
COMMENT ON COLUMN price_tiers.variant_id   IS 'Override au niveau variation (prioritaire sur product_id).';
COMMENT ON COLUMN price_tiers.price        IS 'Si pbq_pricing_type = ''fixed'' : prix unitaire HT réel à ce palier.';
COMMENT ON COLUMN price_tiers.discount_percent IS 'Si pbq_pricing_type = ''percentage'' : remise en %.';


-- ============================================================
-- 11. PANIERS
-- ============================================================

CREATE TABLE carts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text        UNIQUE NOT NULL,  -- stocké dans cookie (remplace cartId Shopify)
  user_id       uuid,                         -- NULL = invité ; FK→auth.users en phase 2
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE carts IS 'Paniers (invités et futurs utilisateurs B2B).';


-- ============================================================
-- 12. ARTICLES DU PANIER
-- ============================================================

CREATE TABLE cart_items (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     uuid          NOT NULL REFERENCES carts(id)    ON DELETE CASCADE,
  product_id  uuid          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id  uuid          NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity    integer       NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10,2) NOT NULL,  -- prix verrouillé au moment de l'ajout
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

COMMENT ON COLUMN cart_items.unit_price IS 'Prix au moment de l''ajout (inclut palier PBQ calculé côté serveur).';


-- ============================================================
-- 13. MENUS DE NAVIGATION
-- ============================================================

CREATE TABLE menus (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  handle     text        UNIQUE NOT NULL,  -- ex: 'next-js-frontend-header-menu'
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id    uuid    NOT NULL REFERENCES menus(id)      ON DELETE CASCADE,
  parent_id  uuid             REFERENCES menu_items(id) ON DELETE CASCADE,
  title      text    NOT NULL,
  url        text    NOT NULL,
  position   integer NOT NULL DEFAULT 0
);


-- ============================================================
-- 14. PAGES CMS
-- ============================================================

CREATE TABLE pages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  handle          text        UNIQUE NOT NULL,  -- URL /[page]
  title           text        NOT NULL,
  body            text,                         -- HTML
  body_summary    text,
  seo_title       text,
  seo_description text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEX DE PERFORMANCE
-- ============================================================

-- products
CREATE INDEX idx_products_type       ON products(type);
CREATE INDEX idx_products_status     ON products(status);
CREATE INDEX idx_products_featured   ON products(featured)       WHERE featured = true;
CREATE INDEX idx_products_supplier   ON products(supplier_code);
CREATE INDEX idx_products_tags       ON products USING gin(tags);

-- variants
CREATE INDEX idx_variants_product    ON variants(product_id);
CREATE INDEX idx_variants_status     ON variants(status);
CREATE INDEX idx_variants_stock      ON variants(stock_status);

-- categories
CREATE INDEX idx_categories_parent   ON categories(parent_id);
CREATE INDEX idx_categories_slug     ON categories(slug);

-- product_categories
CREATE INDEX idx_product_cats_cat    ON product_categories(category_id);

-- product_images
CREATE INDEX idx_images_product      ON product_images(product_id);
CREATE INDEX idx_images_variant      ON product_images(variant_id);
CREATE INDEX idx_images_featured     ON product_images(product_id) WHERE is_featured = true;

-- attributes
CREATE INDEX idx_attr_terms_attr     ON attribute_terms(attribute_id);
CREATE INDEX idx_prod_attrs_product  ON product_attributes(product_id);
CREATE INDEX idx_var_attrs_variant   ON variant_attributes(variant_id);

-- price_tiers
CREATE INDEX idx_price_tiers_product ON price_tiers(product_id);
CREATE INDEX idx_price_tiers_variant ON price_tiers(variant_id);
CREATE INDEX idx_price_tiers_qty     ON price_tiers(min_quantity);

-- carts
CREATE INDEX idx_cart_items_cart     ON cart_items(cart_id);
CREATE INDEX idx_cart_items_variant  ON cart_items(variant_id);
CREATE INDEX idx_carts_session       ON carts(session_token);


-- ============================================================
-- TRIGGERS  updated_at  (auto-mise à jour du timestamp)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_variants_updated_at
  BEFORE UPDATE ON variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- FIN DU SCHÉMA
-- Tables    : 15 (categories, products, product_categories,
--              attributes, attribute_terms, product_attributes,
--              variants, variant_attributes,
--              product_images, price_tiers,
--              carts, cart_items,
--              menus, menu_items, pages)
-- ENUMs     :  4 (product_type, product_status, stock_status, pbq_type)
-- Index     : 20
-- Triggers  :  6 (updated_at)
-- ============================================================
