# Data Coverage Report V2

_Night-Run session — Familles + Variations Workbench_

## Summary

| Category | Count | Coverage |
|---|---|---|
| WooCommerce CSV columns analyzed | ~440 | 100% scanned |
| Columns mapped to Supabase | ~85 | ~19% |
| Columns intentionally ignored | ~310 | ~70% (WP internals, redundant meta) |
| Columns backlogged | ~45 | ~10% (future value) |

## Coverage by domain

### Core product data — MAPPED ✅
- Identity: id (not stored), sku, name, slug, status, type
- Pricing: regular_price, sale_price, eco_contribution (product + variant)
- Stock: stock_quantity, stock_status, min_order_quantity
- Dimensions: weight, length, width, height
- SEO: seo_title, seo_description, tags
- Descriptions: description, short_description
- Relations: categories (pivot), product_images

### Variant / attributes — MAPPED ✅
- variant_attributes (all pa_* attribute columns)
- attribute_terms (all term values)
- Variant pricing and stock
- min_order_quantity at variant level

### Commercial fields (migration 017) — MAPPED ✅
- Supplier: supplier_ref, supplier_name, supplier_purchase_price
- Barcode: gtin_upc_ean_isbn
- Qty rules: min_quantity, max_quantity, group_of_quantity, stock_multiplier
- Flags: active_flag, downloadable, virtual, tax_class_override
- Initial: initial_stock
- Variant eco_contribution

### Family / grouping (migration 016) — MAPPED ✅
- product_families, product_family_members
- product_family_candidates
- products.family_role, products.parent_family_id
- products.parent_sku, products.default_attribute_values

### WooCommerce internals — IGNORED (intentional)
These columns exist in the WooCommerce export but have no meaningful equivalent in the PRODES catalog system:
- `_edit_lock`, `_edit_last` — WP editor locks
- `_product_version` — WooCommerce plugin version
- `_wc_average_rating`, `_wc_review_count` — ratings not used
- `_wpml_*` — multilingual, FR-only site
- `_woocommerce_gpf_*` — Google Product Feed plugin (separate integration)
- `_wc_memberships_*` — membership plugin (not used)
- Yoast `focuskw`, `cornerstone`, `canonical` — some not persisted but canonical handled by Next.js
- WP meta like `_thumbnail_id` — image URL already extracted

### Fields with partial coverage — BACKLOG
| WooCommerce field | Priority | Notes |
|---|---|---|
| `meta:_wc_cog_cost` | Low | Overlaps supplier_purchase_price |
| `meta:_downloadable_files` | Medium | URL list for digital products |
| `meta:_yoast_wpseo_focuskw` | Low | Could add to products as seo_focus_keyword |
| `meta:_product_attributes` (serialized) | Done | Handled via attribute_terms |
| `meta:_sale_price_dates_from/to` | Low | Scheduled pricing not implemented |
| `meta:_backorders` | Low | Backorder rules |
| `meta:_sold_individually` | Medium | Could map to max_quantity=1 |
| `meta:_purchase_note` | Low | Post-purchase email note |

## Backfill script

See `commerce/scripts/backfill-variations.mjs` for a script to:
1. Read 270226.csv
2. For each variable product: create variants from `pa_*` attribute columns
3. Set `parent_sku` on child rows
4. Populate `supplier_ref`, `eco_contribution` from meta columns
5. Run in dry-run mode by default (`--dry-run` flag)

## Recommendations

1. **Apply migration 016 + 017** in Supabase to unlock families and commercial fields
2. **Run backfill script** with `--dry-run` first, review output, then apply
3. **Family assembly**: Use `/api/admin/families/suggest?strategy=parent_sku` to auto-group WooCommerce variable products
4. **Audit**: Run `/api/admin/families/audit` weekly to detect orphans
5. **SEO**: After families are assembled, child product URLs automatically 301-redirect to parent

## Schema version matrix

| Migration | Status | Tables/Columns |
|---|---|---|
| 001 — abandoned carts | Applied | abandoned_carts, cart_recovery_logs |
| 004 — homepage sections | Applied | homepage_sections, section_products |
| 006 — import logs | Applied | import_logs |
| 008 — site config | Applied | site_config |
| 015 — IA usage events | Applied | ia_usage_events |
| 016 — product families | **Pending** | product_families, product_family_members, product_family_candidates, products.family_role, products.parent_family_id |
| 017 — commercial fields | **Pending** | variants.gtin_upc_ean_isbn, min_quantity, max_quantity, group_of_quantity, supplier_ref, supplier_name, supplier_purchase_price, eco_contribution, active_flag, downloadable, virtual, tax_class_override, stock_multiplier, initial_stock; products.default_attribute_values, parent_sku |
