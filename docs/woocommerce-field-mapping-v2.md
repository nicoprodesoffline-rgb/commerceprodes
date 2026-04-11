# WooCommerce → Supabase Field Mapping V2

_Generated: Session Night-Run — Familles + Variations Workbench V2_

## Products table

| WooCommerce CSV column                            | Supabase column                         | Type          | Notes                                      |
| ------------------------------------------------- | --------------------------------------- | ------------- | ------------------------------------------ |
| `ID`                                              | —                                       | —             | Not stored (WooID not needed after import) |
| `post_title` / `post_name`                        | `name` / `slug`                         | text          | Slug deduplicated                          |
| `post_content`                                    | `description`                           | text          | HTML preserved                             |
| `post_excerpt`                                    | `short_description`                     | text          |                                            |
| `post_status`                                     | `status`                                | text          | publish / draft                            |
| `post_type`                                       | `type`                                  | text          | simple / variable                          |
| `sku`                                             | `sku`                                   | text          | unique                                     |
| `_regular_price`                                  | `regular_price`                         | numeric(10,2) |                                            |
| `_sale_price`                                     | `sale_price`                            | numeric(10,2) |                                            |
| `_stock`                                          | `stock_quantity`                        | integer       |                                            |
| `_stock_status`                                   | `stock_status`                          | text          | instock / outofstock                       |
| `_weight`                                         | `weight`                                | numeric(8,3)  | kg                                         |
| `_length` / `_width` / `_height`                  | `length` / `width` / `height`           | numeric(8,2)  | cm                                         |
| `_thumbnail_id` → image URL                       | `product_images.url` (is_featured=true) | FK table      |                                            |
| `_product_image_gallery`                          | `product_images` rows                   | FK table      | Comma-separated → multiple rows            |
| `tax:product_type`                                | `type`                                  | text          | simple / variable                          |
| `meta:_seo_title` / `_yoast_wpseo_title`          | `seo_title`                             | text          |                                            |
| `meta:_seo_description` / `_yoast_wpseo_metadesc` | `seo_description`                       | text          |                                            |
| `meta:eco_part` / `meta:_eco_contribution`        | `eco_contribution`                      | numeric(10,2) | €, product-level                           |
| `meta:fournisseur` / `meta:_supplier_name`        | `supplier_name`                         | text          |                                            |
| `meta:ref_fournisseur`                            | `supplier_ref`                          | text          |                                            |
| `meta:prix_achat`                                 | `purchase_price`                        | numeric(10,2) |                                            |
| `meta:_min_order_quantity` / `meta:min_quantity`  | `min_order_quantity`                    | integer       |                                            |
| `meta:pbq_enabled`                                | `pbq_enabled`                           | boolean       | Palier de prix qty                         |
| `meta:pbq_pricing_type`                           | `pbq_pricing_type`                      | text          | fixed / percentage                         |
| `meta:pbq_min_quantity`                           | `pbq_min_quantity`                      | integer       |                                            |
| `meta:featured`                                   | `featured`                              | boolean       |                                            |
| `post_parent` (→ parent SKU)                      | `parent_sku`                            | text          | Added migration 017                        |
| `meta:default_attributes`                         | `default_attribute_values`              | jsonb         | Added migration 017                        |
| categories                                        | `product_categories` pivot              | FK table      |                                            |
| tags                                              | `tags`                                  | text[]        |                                            |

## Variants table

| WooCommerce CSV column                       | Supabase column                          | Type          | Notes               |
| -------------------------------------------- | ---------------------------------------- | ------------- | ------------------- |
| `ID` (variation post)                        | —                                        | —             |                     |
| `sku`                                        | `sku`                                    | text          |                     |
| `_regular_price`                             | `regular_price`                          | numeric(10,2) |                     |
| `_sale_price`                                | `sale_price`                             | numeric(10,2) |                     |
| `_stock`                                     | `stock_quantity`                         | integer       |                     |
| `_stock_status`                              | `stock_status`                           | text          |                     |
| `_weight` / `_length` / `_width` / `_height` | `weight` / `length` / `width` / `height` | numeric       |                     |
| `attribute_*`                                | `variant_attributes` rows                | FK table      |                     |
| `meta:_min_order_quantity`                   | `min_order_quantity`                     | integer       | Variant-level       |
| `meta:eco_part`                              | `eco_contribution`                       | numeric(10,2) | Added migration 017 |
| `menu_order`                                 | `position`                               | integer       |                     |
| `post_status`                                | `status`                                 | text          |                     |

### New variant columns (migration 017)

| WooCommerce / External field          | Supabase column           | Notes            |
| ------------------------------------- | ------------------------- | ---------------- |
| `meta:gtin` / `meta:ean` / `meta:upc` | `gtin_upc_ean_isbn`       | Barcode          |
| `meta:tax_class`                      | `tax_class_override`      | Override parent  |
| `post_status`                         | `active_flag`             | boolean shortcut |
| `meta:downloadable`                   | `downloadable`            | boolean          |
| `meta:virtual`                        | `virtual`                 | boolean          |
| `meta:min_quantity`                   | `min_quantity`            | Qty rules        |
| `meta:max_quantity`                   | `max_quantity`            |                  |
| `meta:group_of`                       | `group_of_quantity`       | Min multiple     |
| `meta:stock_multiplier`               | `stock_multiplier`        |                  |
| `meta:initial_stock`                  | `initial_stock`           |                  |
| `meta:supplier_ref`                   | `supplier_ref`            |                  |
| `meta:supplier_name`                  | `supplier_name`           |                  |
| `meta:prix_achat`                     | `supplier_purchase_price` |                  |
| `meta:eco_part`                       | `eco_contribution`        | Variant-level    |

## Family tables (migration 016)

| Concept         | Table                       | Key columns                                                        |
| --------------- | --------------------------- | ------------------------------------------------------------------ |
| Famille produit | `product_families`          | id, name, slug, parent_product_id, strategy                        |
| Membres         | `product_family_members`    | family_id, product_id OR variant_id, member_type, position, active |
| Candidats IA    | `product_family_candidates` | suggested_parent_id, suggested_child_id, strategy, score, status   |
| Rôle produit    | `products.family_role`      | null / child / mother                                              |
| Lien famille    | `products.parent_family_id` | FK → product_families                                              |

## Columns not yet mapped (sample from 270226.csv)

The following WooCommerce meta columns were identified in the CSV but are not yet mapped to Supabase columns. They represent a backlog for future migrations:

- `meta:_wc_review_count` — review counts (external rating system)
- `meta:_woocommerce_gpf_*` — Google Product Feed custom fields
- `meta:_yoast_wpseo_focuskw` — SEO focus keyword (could add to products)
- `meta:_downloadable_files` — downloadable product file URLs
- `meta:_wc_memberships_*` — membership-gated product rules
- `meta:_wpml_*` — multilingual fields (not relevant for FR-only site)
- `meta:_wc_cog_cost` — cost of goods (overlaps with supplier_purchase_price)
- `tax:pa_*` attributes with >50 distinct attribute types — fully mapped via `attribute_terms`
