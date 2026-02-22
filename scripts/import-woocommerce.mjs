#!/usr/bin/env node
/**
 * PRODES — Import WooCommerce CSV → Supabase
 *
 * Usage:
 *   SUPABASE_KEY=<service_role_key> node scripts/import-woocommerce.mjs
 *
 * La clé service_role est recommandée (RLS bypass).
 * Elle est disponible dans : Supabase Dashboard → Settings → API → service_role.
 * Si vous n'avez que la clé anon, le script tentera de l'utiliser (fonctionne
 * tant que RLS est désactivé sur toutes les tables = badge UNRESTRICTED).
 *
 * Ce que le script fait :
 *  1. Parse le CSV WooCommerce (443 colonnes, champs multi-lignes HTML)
 *  2. Filtre uniquement les lignes status = publish
 *  3. Insère dans l'ordre : catégories → attributs+termes → produits →
 *     product_categories → product_attributes → variants →
 *     variant_attributes → product_images → price_tiers
 *  4. Utilise upsert sur les clés naturelles (sku, slug) → re-runnable
 *  5. Génère un rapport dans data/import-report.json
 *
 * Note : product_images et price_tiers sont purgés par produit avant
 * chaque import pour éviter les doublons en cas de re-run.
 */

import { createClient }  from '@supabase/supabase-js';
import { parse }         from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://mvnaeddtvyaqkdliivdk.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  // Clé anon en fallback — remplacez par votre service_role si disponible
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12bmFlZGR0dnlhcWtkbGlpdmRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1Nzg4NjksImV4cCI6MjA4NzE1NDg2OX0.Aaxm_IZmjH_DyqVAWvQm41aGY452Fc61lV57wUaun1g';

const CSV_PATH    = join(__dirname, '../data/PRODES_FULLDB_260219.csv');
const REPORT_PATH = join(__dirname, '../data/import-report.json');

const BATCH_SIZE = 50;  // rows per Supabase upsert call

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION — PostgREST limite à 1000 lignes par requête par défaut.
// Cette fonction pagine automatiquement pour récupérer toutes les lignes.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAll(table, select, pageSize = 1000) {
  let page = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) {
      logError('fetchAll:' + table, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// RAPPORT D'IMPORT
// ─────────────────────────────────────────────────────────────────────────────

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  durationSec: null,
  counts: {},
  errors: [],
  warnings: [],
};

function logError(step, msg, detail = null) {
  const entry = { step, msg, detail };
  report.errors.push(entry);
  console.error(`  ✗ [${step}] ${msg}`, detail ? `→ ${JSON.stringify(detail)}` : '');
}

function logWarn(step, msg) {
  report.warnings.push({ step, msg });
  console.warn(`  ⚠ [${step}] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit un texte français en slug URL */
function slugify(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // supprime les diacritiques
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** parseFloat ou null */
function toFloat(val) {
  if (!val || String(val).trim() === '') return null;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** parseInt ou null */
function toInt(val) {
  if (!val || String(val).trim() === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

/** 'yes'/'1'/'true' → true, tout le reste → false */
function toBool(val, def = false) {
  if (!val) return def;
  return ['yes', '1', 'true'].includes(String(val).toLowerCase().trim());
}

/** '' ou undefined → null */
function nullable(val) {
  const s = String(val ?? '').trim();
  return s === '' ? null : s;
}

/** Décode les entités HTML (&quot; &amp; …) */
function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Détecte si le contenu est du JSON Elementor (→ inutilisable en front).
 * WooCommerce + Elementor stocke le JSON de page builder dans post_content.
 */
function isElementorJson(str) {
  if (!str) return false;
  const s = str.trimStart();
  return s.startsWith('[{"id"') || s.startsWith('[{&quot;id&quot;') || s.includes('"elType"');
}

/**
 * Parse les images WooCommerce.
 * Format : "url ! alt : texte ! title : texte ! desc :  ! caption :  | url2 ! …"
 */
function parseImages(imagesStr) {
  if (!imagesStr || imagesStr.trim() === '') return [];

  return imagesStr
    .split('|')
    .map((chunk, idx) => {
      const parts = chunk.split('!').map(p => p.trim());
      const url   = parts[0]?.trim() ?? '';
      if (!url.startsWith('http')) return null;

      const getMeta = (key) => {
        const part = parts.find(p => {
          const low = p.toLowerCase();
          return low.startsWith(key + ' :') || low.startsWith(key + ':');
        });
        if (!part) return '';
        return part.replace(new RegExp(`^${key}\\s*:\\s*`, 'i'), '').trim();
      };

      return {
        url,
        alt_text:   getMeta('alt')   || '',
        title:      getMeta('title') || '',
        position:   idx,
        is_featured: idx === 0,
      };
    })
    .filter(Boolean);
}

/**
 * Parse les données PBQ (grilles de prix par quantité).
 * Le champ CSV peut être du JSON pur ou HTML-encodé.
 * Retourne [{min_quantity, price?, discount_percent?, position}]
 * — le premier palier sans remise (base price) est ignoré.
 */
function parsePBQTiers(jsonStr, pricingType) {
  if (!jsonStr || ['', '[]', 'null'].includes(jsonStr.trim())) return [];

  try {
    const decoded = decodeHtml(jsonStr.trim());
    const raw = JSON.parse(decoded);
    if (!Array.isArray(raw)) return [];

    const tiers = [];
    raw.forEach((tier, i) => {
      const qty     = parseInt(tier.pbq_quantity ?? tier.qty ?? '0', 10);
      const discStr = String(tier.pbq_discount ?? tier.disc ?? '').trim();

      if (!qty || qty < 1)         return;  // skip invalid qty
      if (discStr === '' || discStr === '0') return;  // skip "base price" tier

      const disc = parseFloat(discStr);
      if (isNaN(disc)) return;

      if (pricingType === 'percentage') {
        tiers.push({ min_quantity: qty, discount_percent: disc, position: i });
      } else {
        // 'fixed' ou valeur inconnue → on traite comme prix unitaire
        tiers.push({ min_quantity: qty, price: disc, position: i });
      }
    });

    return tiers;
  } catch {
    return [];
  }
}

/**
 * Parse les catégories WooCommerce.
 * Entrée : "Cat1|Cat1 > SubCat|Cat2 > SubCat2 > SubSubCat"
 * Sortie : tableau de tableaux [[Cat1], [Cat1, SubCat], [Cat2, SubCat2, SubSubCat]]
 */
function parseCategoryPaths(catStr) {
  if (!catStr || catStr.trim() === '') return [];
  return catStr
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(path => path.split('>').map(s => s.trim()).filter(Boolean));
}

/** Parse les tags (séparés par |) */
function parseTags(tagStr) {
  if (!tagStr || tagStr.trim() === '') return [];
  return tagStr.split('|').map(s => s.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH UPSERT générique
// ─────────────────────────────────────────────────────────────────────────────

async function batchUpsert(table, rows, conflictCol, label, ignoreDups = false) {
  if (rows.length === 0) {
    console.log(`  ⏭  ${label}: aucune ligne`);
    report.counts[label] = 0;
    return 0;
  }

  let success = 0;
  let failed  = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictCol, ignoreDuplicates: ignoreDups });

    if (error) {
      logError(label, `batch ${i}–${i + batch.length}`, error.message);
      failed += batch.length;
    } else {
      success += batch.length;
    }
  }

  console.log(`  ✓ ${label}: ${success} lignes${failed ? ` (${failed} erreurs)` : ''}`);
  report.counts[label] = success;
  return success;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 1 — Parse CSV
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  console.log('📂 Lecture du CSV…');
  const content = readFileSync(filePath, { encoding: 'utf-8' });

  const rows = parse(content, {
    columns:             true,   // première ligne = noms de colonnes
    skip_empty_lines:    true,
    relax_quotes:        true,   // tolère les guillemets mal fermés
    relax_column_count:  true,   // tolère les lignes avec moins/plus de colonnes
    trim:                false,  // ne pas trimmer (préserver HTML)
    bom:                 true,   // gérer le BOM UTF-8
  });

  console.log(`  → ${rows.length} lignes brutes parsées`);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — Classifier les lignes
// ─────────────────────────────────────────────────────────────────────────────

function classifyRows(rows) {
  const parents  = [];  // simples + variables (pas de parent_sku)
  const children = [];  // variations (ont un parent_sku)
  let skipped    = 0;

  for (const row of rows) {
    const status    = (row['post_status'] ?? '').trim();
    const sku       = (row['sku'] ?? '').trim();
    const parentSku = (row['parent_sku'] ?? '').trim();
    const type      = (row['tax:product_type'] ?? '').trim();

    // Filtre : publish uniquement + SKU obligatoire
    if (status !== 'publish') { skipped++; continue; }
    if (!sku)                  { skipped++; continue; }

    if (parentSku) {
      children.push(row);
    } else if (type === 'simple' || type === 'variable') {
      parents.push(row);
    } else {
      skipped++;
    }
  }

  console.log(
    `  → ${parents.length} parents (${parents.filter(r => r['tax:product_type'] === 'simple').length} simples, ` +
    `${parents.filter(r => r['tax:product_type'] === 'variable').length} variables), ` +
    `${children.length} variations, ${skipped} ignorés`
  );
  return { parents, children };
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 3 — Collecter et insérer les catégories
// ─────────────────────────────────────────────────────────────────────────────

function collectCategories(parents) {
  // slug → { name, slug, parentSlug | null }
  const catMap = new Map();

  for (const row of parents) {
    const paths = parseCategoryPaths(row['tax:product_cat'] ?? '');
    for (const path of paths) {
      let parentSlug = null;
      for (const catName of path) {
        const slug = slugify(catName);
        if (!slug) continue;
        if (!catMap.has(slug)) {
          catMap.set(slug, { name: catName, slug, parentSlug });
        }
        parentSlug = slug;
      }
    }
  }

  return catMap;
}

async function insertCategories(catMap) {
  console.log('\n📁 Catégories…');

  const all       = Array.from(catMap.values());
  const topLevel  = all.filter(c => !c.parentSlug);
  const withParent = all.filter(c =>  c.parentSlug);

  // Insérer les top-level
  const { data: tops, error: topErr } = await supabase
    .from('categories')
    .upsert(topLevel.map(c => ({ name: c.name, slug: c.slug })), { onConflict: 'slug' })
    .select('id, slug');

  if (topErr) {
    logError('categories', 'top-level', topErr.message);
    return new Map();
  }

  const slugToId = new Map(tops.map(c => [c.slug, c.id]));

  // Insérer les enfants (jusqu'à 5 niveaux de profondeur)
  let remaining = [...withParent];
  for (let pass = 0; pass < 5 && remaining.length > 0; pass++) {
    const insertable = remaining.filter(c => slugToId.has(c.parentSlug));
    if (insertable.length === 0) break;

    const { data: kids, error: kidErr } = await supabase
      .from('categories')
      .upsert(
        insertable.map(c => ({
          name: c.name,
          slug: c.slug,
          parent_id: slugToId.get(c.parentSlug),
        })),
        { onConflict: 'slug' }
      )
      .select('id, slug');

    if (kidErr) {
      logError('categories', `enfants pass ${pass}`, kidErr.message);
    } else {
      kids.forEach(c => slugToId.set(c.slug, c.id));
    }

    remaining = remaining.filter(c => !slugToId.has(c.slug));
  }

  if (remaining.length > 0) {
    logWarn('categories', `${remaining.length} catégories non insérées (parent introuvable)`);
  }

  console.log(`  ✓ Catégories: ${slugToId.size}`);
  report.counts['categories'] = slugToId.size;
  return slugToId;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 4 — Collecter et insérer les attributs + termes
// ─────────────────────────────────────────────────────────────────────────────

function collectAttributes(allRows, headers) {
  const attrCols = headers.filter(h => h.startsWith('attribute:pa_'));
  // attrSlug → { slug, name, terms: Map<termSlug, { slug, name }> }
  const attrMap  = new Map();

  for (const row of allRows) {
    for (const col of attrCols) {
      const attrSlug = col.replace('attribute:', '');  // ex: 'pa_couleurs'
      const rawVals  = (row[col] ?? '').trim();
      if (!rawVals) continue;

      const values = rawVals.split('|').map(v => v.trim()).filter(Boolean);
      if (values.length === 0) continue;

      if (!attrMap.has(attrSlug)) {
        // Nom lisible : 'pa_couleurs' → 'Couleurs'
        const name = attrSlug
          .replace(/^pa_/, '')
          .split(/[-_]/)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        attrMap.set(attrSlug, { slug: attrSlug, name, terms: new Map() });
      }

      const attr = attrMap.get(attrSlug);
      for (const val of values) {
        const termSlug = slugify(val);
        if (termSlug && !attr.terms.has(termSlug)) {
          attr.terms.set(termSlug, { slug: termSlug, name: val });
        }
      }
    }
  }

  return attrMap;
}

async function insertAttributes(attrMap) {
  console.log('\n🏷  Attributs…');

  const attrRows = Array.from(attrMap.values()).map((a, i) => ({
    slug: a.slug,
    name: a.name,
    type: 'select',
    position: i,
  }));

  const { data: inserted, error } = await supabase
    .from('attributes')
    .upsert(attrRows, { onConflict: 'slug' })
    .select('id, slug');

  if (error) {
    logError('attributes', 'insert', error.message);
    return { attrSlugToId: new Map() };
  }

  const attrSlugToId = new Map(inserted.map(a => [a.slug, a.id]));

  // Termes
  const termRows = [];
  for (const [attrSlug, attr] of attrMap) {
    const attrId = attrSlugToId.get(attrSlug);
    if (!attrId) continue;
    let pos = 0;
    for (const term of attr.terms.values()) {
      termRows.push({
        attribute_id: attrId,
        slug:         term.slug,
        name:         term.name,
        position:     pos++,
      });
    }
  }

  await batchUpsert('attribute_terms', termRows, 'attribute_id,slug', 'AttributeTerms');

  console.log(`  ✓ Attributs: ${attrSlugToId.size}`);
  report.counts['attributes'] = attrSlugToId.size;
  return { attrSlugToId };
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 5 — Insérer les produits (parents)
// ─────────────────────────────────────────────────────────────────────────────

async function insertProducts(parents) {
  console.log('\n📦 Produits…');

  // Garantit l'unicité des slugs (WooCommerce peut avoir des doublons)
  const usedSlugs = new Map();  // slug → count

  const rows = parents.map(row => {
    const type    = (row['tax:product_type'] ?? 'simple').trim();
    const rawSlug = (row['post_name'] ?? '').trim() || slugify(row['post_title'] ?? '');
    const sku     = row['sku'].trim();

    // Déduplique les slugs
    let slug = rawSlug || slugify(sku);
    if (usedSlugs.has(slug)) {
      usedSlugs.set(slug, usedSlugs.get(slug) + 1);
      slug = `${slug}-${usedSlugs.get(slug)}`;
    } else {
      usedSlugs.set(slug, 1);
    }

    const pbqRaw     = (row['meta:pbq_pricing_type_enable'] ?? '').trim();
    const pbqEnabled = pbqRaw === 'enable';
    const pbqType    = pbqEnabled ? (nullable(row['meta:pbq_pricing_type']) ?? 'fixed') : null;

    // post_content : ignorer si c'est du JSON Elementor
    const rawContent = (row['post_content'] ?? '').trim();
    const description = isElementorJson(rawContent) ? null : (nullable(rawContent));

    return {
      sku,
      slug,
      name:              (row['post_title'] ?? '').trim(),
      description,
      short_description: nullable(row['post_excerpt']),
      type,
      status:            'publish',
      featured:          toBool(row['featured']),
      regular_price:     toFloat(row['regular_price']),
      sale_price:        toFloat(row['sale_price']),
      sale_price_start:  nullable(row['sale_price_dates_from']),
      sale_price_end:    nullable(row['sale_price_dates_to']),
      stock_quantity:    toInt(row['stock']),
      stock_status:      (row['stock_status'] ?? 'instock').trim() || 'instock',
      manage_stock:      toBool(row['manage_stock']),
      backorders_allowed: ['yes', 'notify'].includes((row['backorders'] ?? '').trim()),
      low_stock_threshold: toInt(row['low_stock_amount']),
      sold_individually: toBool(row['sold_individually']),
      weight:            toFloat(row['weight']),
      length:            toFloat(row['length']),
      width:             toFloat(row['width']),
      height:            toFloat(row['height']),
      tax_status:        nullable(row['tax_status']) ?? 'taxable',
      tax_class:         nullable(row['tax_class'])  ?? '',
      supplier_code:     nullable(row['meta:fournisseur']),
      supplier_ref:      nullable(row['meta:ref_fournisseur']),
      supplier_price:    toFloat(row['meta:prix_achat_fournisseur']),
      eco_contribution:  toFloat(row['meta:eco_part']),
      pbq_enabled:       pbqEnabled,
      pbq_pricing_type:  pbqType,
      pbq_min_quantity:  toInt(row['meta:pbq_min_quantity']) ?? 1,
      pbq_max_quantity:  toInt(row['meta:pbq_max_quantity']),
      seo_title:         nullable(row['meta:_yoast_wpseo_title']),
      seo_description:   nullable(row['meta:_yoast_wpseo_metadesc']),
      tags:              parseTags(row['tax:product_tag']),
    };
  });

  await batchUpsert('products', rows, 'sku', 'Products');

  // Récupère tous les IDs (paginé — évite la limite PostgREST de 1000 lignes)
  const allProds = await fetchAll('products', 'id, sku');
  const skuToId  = new Map(allProds.map(p => [p.sku, p.id]));
  console.log(`  → ${skuToId.size} produits en base`);
  return skuToId;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 6 — product_categories (pivot)
// ─────────────────────────────────────────────────────────────────────────────

async function insertProductCategories(parents, skuToId, catSlugToId) {
  console.log('\n🔗 product_categories…');

  const pivotRows = [];
  for (const row of parents) {
    const productId = skuToId.get(row['sku'].trim());
    if (!productId) continue;

    const paths  = parseCategoryPaths(row['tax:product_cat'] ?? '');
    const seenCats = new Set();

    for (const path of paths) {
      for (const catName of path) {
        const catId = catSlugToId.get(slugify(catName));
        if (catId && !seenCats.has(catId)) {
          seenCats.add(catId);
          pivotRows.push({ product_id: productId, category_id: catId });
        }
      }
    }
  }

  await batchUpsert(
    'product_categories', pivotRows,
    'product_id,category_id', 'ProductCategories',
    true  // ignoreDuplicates
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 7 — product_attributes
// ─────────────────────────────────────────────────────────────────────────────

async function insertProductAttributes(parents, skuToId, attrSlugToId, headers) {
  console.log('\n🏷  product_attributes…');

  const attrCols = headers.filter(h => h.startsWith('attribute:pa_'));
  const paRows   = [];

  for (const row of parents) {
    const productId = skuToId.get(row['sku'].trim());
    if (!productId) continue;

    for (const col of attrCols) {
      const attrSlug = col.replace('attribute:', '');
      const attrId   = attrSlugToId.get(attrSlug);
      if (!attrId) continue;

      const rawVals = (row[col] ?? '').trim();
      if (!rawVals) continue;

      const terms = rawVals.split('|').map(v => slugify(v.trim())).filter(Boolean);
      if (terms.length === 0) continue;

      // attribute_data:pa_X = "0|1|1"  (visible | variation | used_for_variation)
      const dataStr = (row[`attribute_data:${attrSlug}`] ?? '0|0|0').trim();
      const [visFlag, varFlag] = dataStr.split('|');

      const defaultRaw  = (row[`attribute_default:${attrSlug}`] ?? '').trim();
      const defaultTerm = defaultRaw ? slugify(defaultRaw) : null;

      paRows.push({
        product_id:   productId,
        attribute_id: attrId,
        terms,
        is_visible:   visFlag === '1',
        is_variation: varFlag === '1',
        default_term: defaultTerm,
      });
    }
  }

  await batchUpsert('product_attributes', paRows, 'product_id,attribute_id', 'ProductAttributes');
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 8 — Variants
// ─────────────────────────────────────────────────────────────────────────────

async function insertVariants(parents, children, skuToId) {
  console.log('\n🔄 Variants…');

  const variantRows = [];

  // Produits simples → 1 variante "Default"
  for (const row of parents) {
    if ((row['tax:product_type'] ?? '').trim() !== 'simple') continue;
    const productId = skuToId.get(row['sku'].trim());
    if (!productId) continue;

    variantRows.push({
      product_id:        productId,
      sku:               `${row['sku'].trim()}-default`,
      name:              'Default',
      description:       null,
      regular_price:     toFloat(row['regular_price']),
      sale_price:        toFloat(row['sale_price']),
      stock_quantity:    toInt(row['stock']),
      stock_status:      (row['stock_status'] ?? 'instock').trim() || 'instock',
      manage_stock:      toBool(row['manage_stock']),
      weight:            toFloat(row['weight']),
      length:            toFloat(row['length']),
      width:             toFloat(row['width']),
      height:            toFloat(row['height']),
      min_order_quantity: toInt(row['meta:minimum_allowed_quantity']) ?? 1,
      status:            'publish',
      position:          0,
    });
  }

  // Variations WooCommerce (enfants des variables)
  for (const row of children) {
    const parentSku = row['parent_sku'].trim();
    const productId = skuToId.get(parentSku);
    if (!productId) {
      logWarn('variants', `Parent SKU introuvable: "${parentSku}" pour variation "${row['sku']}"`);
      continue;
    }

    const rawContent = (row['post_content'] ?? '').trim();
    const description =
      nullable(row['meta:_variation_description']) ||
      (isElementorJson(rawContent) ? null : nullable(rawContent));

    variantRows.push({
      product_id:        productId,
      sku:               row['sku'].trim(),
      name:              (row['post_title'] ?? row['sku']).trim(),
      description,
      regular_price:     toFloat(row['regular_price']),
      sale_price:        toFloat(row['sale_price']),
      stock_quantity:    toInt(row['stock']),
      stock_status:      (row['stock_status'] ?? 'instock').trim() || 'instock',
      manage_stock:      toBool(row['manage_stock']),
      weight:            toFloat(row['weight']),
      length:            toFloat(row['length']),
      width:             toFloat(row['width']),
      height:            toFloat(row['height']),
      min_order_quantity: toInt(row['meta:variation_minimum_allowed_quantity']) ?? 1,
      status:            'publish',
      position:          toInt(row['menu_order']) ?? 0,
    });
  }

  await batchUpsert('variants', variantRows, 'sku', 'Variants');

  // Récupère tous les IDs (paginé — 6800+ lignes dépassent la limite PostgREST)
  const allVars    = await fetchAll('variants', 'id, sku');
  const varSkuToId = new Map(allVars.map(v => [v.sku, v.id]));
  console.log(`  → ${varSkuToId.size} variants en base`);
  return varSkuToId;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 9 — variant_attributes
// ─────────────────────────────────────────────────────────────────────────────

async function insertVariantAttributes(children, varSkuToId, attrSlugToId, headers) {
  console.log('\n🔑 variant_attributes…');

  // Les valeurs des attributs par variation sont dans meta:attribute_pa_*
  const metaAttrCols = headers.filter(h => h.startsWith('meta:attribute_pa_'));
  const vaRows = [];

  for (const row of children) {
    const variantId = varSkuToId.get(row['sku'].trim());
    if (!variantId) continue;

    for (const col of metaAttrCols) {
      const attrSlug = col.replace('meta:attribute_', '');  // pa_couleurs
      const attrId   = attrSlugToId.get(attrSlug);
      if (!attrId) continue;

      const rawVal = (row[col] ?? '').trim();
      if (!rawVal) continue;

      const termSlug = slugify(rawVal);
      if (!termSlug) continue;

      vaRows.push({
        variant_id:   variantId,
        attribute_id: attrId,
        term_slug:    termSlug,
      });
    }
  }

  await batchUpsert(
    'variant_attributes', vaRows,
    'variant_id,attribute_id', 'VariantAttributes',
    false
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 10 — product_images
// Stratégie : DELETE existing + INSERT pour idempotence
// ─────────────────────────────────────────────────────────────────────────────

async function insertProductImages(parents, children, skuToId, varSkuToId) {
  console.log('\n🖼  Images…');

  // Purge des images existantes (idempotence re-run).
  // .in() est limité à ~1000 valeurs — on envoie par blocs de 200.
  const allProductIds = Array.from(skuToId.values());
  for (let i = 0; i < allProductIds.length; i += 200) {
    const batch = allProductIds.slice(i, i + 200);
    await supabase.from('product_images').delete().in('product_id', batch);
  }
  // Purge aussi les images de variants
  const allVariantIds = Array.from(varSkuToId.values());
  for (let i = 0; i < allVariantIds.length; i += 200) {
    const batch = allVariantIds.slice(i, i + 200);
    await supabase.from('product_images').delete().in('variant_id', batch);
  }

  const imgRows = [];

  // Images des produits parents
  for (const row of parents) {
    const productId = skuToId.get(row['sku'].trim());
    if (!productId) continue;
    for (const img of parseImages(row['images'] ?? '')) {
      imgRows.push({ product_id: productId, ...img });
    }
  }

  // Images des variations (si présentes dans le champ images)
  for (const row of children) {
    const variantId = varSkuToId.get(row['sku'].trim());
    if (!variantId) continue;
    const imgs = parseImages(row['images'] ?? '');
    if (imgs.length === 0) continue;
    for (const img of imgs) {
      imgRows.push({ variant_id: variantId, ...img });
    }
  }

  // Insert simple (pas upsert — pas de clé naturelle unique sur les images)
  let total = 0;
  for (let i = 0; i < imgRows.length; i += BATCH_SIZE) {
    const batch = imgRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('product_images').insert(batch);
    if (error) logError('product_images', `batch ${i}`, error.message);
    else total += batch.length;
  }

  console.log(`  ✓ ProductImages: ${total}`);
  report.counts['ProductImages'] = total;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 11 — price_tiers
// Stratégie : DELETE existing + INSERT pour idempotence
// ─────────────────────────────────────────────────────────────────────────────

async function insertPriceTiers(parents, children, skuToId, varSkuToId) {
  console.log('\n💶 Grilles de prix…');

  // Purge (par blocs de 200 pour rester dans les limites PostgREST)
  const allProductIds = Array.from(skuToId.values());
  for (let i = 0; i < allProductIds.length; i += 200) {
    const batch = allProductIds.slice(i, i + 200);
    await supabase.from('price_tiers').delete().in('product_id', batch);
  }
  const allVariantIds = Array.from(varSkuToId.values());
  for (let i = 0; i < allVariantIds.length; i += 200) {
    const batch = allVariantIds.slice(i, i + 200);
    await supabase.from('price_tiers').delete().in('variant_id', batch);
  }

  const tierRows = [];

  // Paliers au niveau produit (parent rows)
  for (const row of parents) {
    const pbqEnabled = (row['meta:pbq_pricing_type_enable'] ?? '').trim() === 'enable';
    if (!pbqEnabled) continue;

    const productId  = skuToId.get(row['sku'].trim());
    if (!productId) continue;

    const pricingType = (row['meta:pbq_pricing_type'] ?? 'fixed').trim() || 'fixed';
    const tiers = parsePBQTiers(row['meta:pbq_discount_table_data'] ?? '', pricingType);

    for (const tier of tiers) {
      tierRows.push({ product_id: productId, ...tier });
    }
  }

  // Paliers au niveau variation (moins courant — override par variation)
  // Construit un lookup SKU→pricingType depuis les parents pour hériter le type
  const parentPricingType = new Map(
    parents.map(r => [r['sku'].trim(), (r['meta:pbq_pricing_type'] ?? 'fixed').trim() || 'fixed'])
  );

  for (const row of children) {
    const pbqData = (row['meta:pbq_discount_table_data'] ?? '').trim();
    if (!pbqData || pbqData === '[]') continue;

    const variantId = varSkuToId.get(row['sku'].trim());
    if (!variantId) continue;

    const parentSku   = row['parent_sku'].trim();
    const pricingType = parentPricingType.get(parentSku) ?? 'fixed';
    const tiers       = parsePBQTiers(pbqData, pricingType);

    for (const tier of tiers) {
      tierRows.push({ variant_id: variantId, ...tier });
    }
  }

  // Insert simple
  let total = 0;
  for (let i = 0; i < tierRows.length; i += BATCH_SIZE) {
    const batch = tierRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('price_tiers').insert(batch);
    if (error) logError('price_tiers', `batch ${i}`, error.message);
    else total += batch.length;
  }

  console.log(`  ✓ PriceTiers: ${total} paliers`);
  report.counts['PriceTiers'] = total;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  PRODES — Import WooCommerce → Supabase');
  console.log('═══════════════════════════════════════════════════\n');

  const t0 = Date.now();

  // ── Vérification de la connexion ──────────────────────────
  console.log('🔌 Vérification de la connexion Supabase…');
  const { error: pingErr } = await supabase.from('products').select('id').limit(1);
  if (pingErr) {
    console.error('❌ Connexion échouée:', pingErr.message);
    console.error('   → Fournissez la clé service_role : SUPABASE_KEY=xxx node scripts/import-woocommerce.mjs');
    process.exit(1);
  }
  console.log('✅ Connexion OK\n');

  // ── Parse CSV ─────────────────────────────────────────────
  const rows    = parseCSV(CSV_PATH);
  const headers = Object.keys(rows[0] ?? {});
  console.log(`  → ${headers.length} colonnes détectées`);

  // ── Classify ──────────────────────────────────────────────
  console.log('\n🔍 Classification des lignes…');
  const { parents, children } = classifyRows(rows);

  // ── Catégories ────────────────────────────────────────────
  const catMap      = collectCategories(parents);
  console.log(`\n  → ${catMap.size} catégories uniques collectées`);
  const catSlugToId = await insertCategories(catMap);

  // ── Attributs ─────────────────────────────────────────────
  const attrMap = collectAttributes([...parents, ...children], headers);
  console.log(`\n  → ${attrMap.size} attributs collectés`);
  const { attrSlugToId } = await insertAttributes(attrMap);

  // ── Produits ──────────────────────────────────────────────
  const skuToId = await insertProducts(parents);

  // ── Pivots catégories ─────────────────────────────────────
  await insertProductCategories(parents, skuToId, catSlugToId);

  // ── Attributs par produit ─────────────────────────────────
  await insertProductAttributes(parents, skuToId, attrSlugToId, headers);

  // ── Variants ──────────────────────────────────────────────
  const varSkuToId = await insertVariants(parents, children, skuToId);

  // ── Attributs par variation ───────────────────────────────
  await insertVariantAttributes(children, varSkuToId, attrSlugToId, headers);

  // ── Images ────────────────────────────────────────────────
  await insertProductImages(parents, children, skuToId, varSkuToId);

  // ── Grilles de prix ───────────────────────────────────────
  await insertPriceTiers(parents, children, skuToId, varSkuToId);

  // ── Rapport ───────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  report.finishedAt  = new Date().toISOString();
  report.durationSec = parseFloat(elapsed);

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`✅ Import terminé en ${elapsed}s`);
  console.log('   Rapport → data/import-report.json');

  if (report.errors.length > 0) {
    console.log(`\n⚠️  ${report.errors.length} erreur(s) — voir import-report.json`);
  }

  console.log('\nRésumé :');
  for (const [k, v] of Object.entries(report.counts)) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n💥 Erreur fatale:', err);
  report.errors.push({ step: 'main', msg: err.message, detail: err.stack });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  process.exit(1);
});
