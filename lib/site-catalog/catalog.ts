/**
 * Vues de lecture dérivées UNIQUEMENT du DTO `site_snapshot.v1` servi par la source
 * de catalogue. Aucune donnée hors DTO, aucun produit cartésien d'axes : seuls les
 * Items publiés existent. Aucun prix calculé ici (la sélection est `selectPrice`).
 */
import type { JsonObject } from "@/c0/ts/src/jsonc";
import { deepFreeze } from "@/lib/site-db/generation";
import { displayName } from "./display-name";
import { CatalogUnavailable, getCatalogSource, type CatalogSource, type ServedGeneration } from "./source";

export type VariantAxes = Record<string, string>;

export type PriceWindow = {
  rate_id: string;
  valid_from_utc: string;
  valid_until_utc: string | null;
  quantity_min: number;
  quantity_max: number | null;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  offer_price_version_public: string;
  /** Catalogue v2 seulement (cercle 3, paquet B) : « PROMOTION » pour une promotion ; `reference_unit_amount` = prix barré fourni par le Calculateur, jamais calculé ici. */
  price_nature?: string | null;
  reference_unit_amount?: string | null;
};

/** Cercle 3 (3.22) : les champs `position`, `intro_text`, `image_sha256`, `seo_*` et `hidden` n'existent que dans un catalogue v2 ; absents (v1), le SITE se comporte comme avant. */
export type Category = {
  category_key: string;
  name: string;
  parent_category_key: string | null;
  position?: number;
  intro_text?: string | null;
  image_sha256?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  hidden?: boolean;
};

export type Item = {
  public_item_key: string;
  public_family_key: string;
  variant_axes: VariantAxes;
  public_media_refs: string[];
  windows: PriceWindow[];
  /** Catalogue v2 seulement : cherchées par la recherche, jamais affichées en tableau (C01/C02). */
  characteristics?: Characteristic[];
};

export type Characteristic = { label: string; value: string };
export type FamilyDocument = { label: string; kind: string; sha256: string; mime: string; size: number };

export type Axis = { axis_key: string; label: string };

export type Family = {
  public_family_key: string;
  slug: string;
  name: string;
  description_short: string;
  description_long: string;
  primary_category_key: string;
  secondary_category_keys: string[];
  image_main_sha256: string;
  axes: Axis[];
  items: Item[];
  /** Catalogue v2 seulement (cercle 3). */
  category_positions?: { category_key: string; position: number }[];
  seo_title?: string | null;
  seo_description?: string | null;
  slug_aliases?: string[];
  /** Date de première publication sur le SITE (paquet A : `first_published_at_utc`; repli sur l'ancien nom `created_at_utc`). */
  first_published_at_utc?: string;
  characteristics?: Characteristic[];
  documents?: FamilyDocument[];
};

export type CatalogMeta = {
  source: CatalogSource["kind"];
  status: ServedGeneration["status"];
  data_label: string;
  publication_id: string;
  projection_id: string;
  catalogue_sequence: number;
  as_of_utc: string;
  payload_sha256: string;
};

export type ItemResolution =
  | { kind: "PUBLISHED"; item: Item; family: Family }
  | { kind: "SUPERSEDED"; superseded_by: string }
  | { kind: "RETIRED" }
  | { kind: "ABSENT" };

export type Catalog = {
  /** Entrée `generation` des fonctions C0 (`{snapshot, status}`), telle que servie. */
  c0Generation: { snapshot: ServedGeneration["snapshot"]; status: ServedGeneration["status"] };
  meta: CatalogMeta;
  categories: Category[];
  families: Family[];
  resolveItem(key: string): ItemResolution;
  familyBySlug(slug: string): Family | null;
  familiesInCategory(categoryKey: string): Family[];
  childCategories(categoryKey: string): Category[];
};

/** Les champs de famille que seule la v2 porte, quand ils existent (le SITE ne les invente jamais). */
function v2Family(f: Record<string, unknown>): Partial<Family> {
  const out: Partial<Family> = {};
  if (Array.isArray(f["category_positions"])) out.category_positions = f["category_positions"] as Family["category_positions"] & object;
  if ("seo_title" in f) out.seo_title = f["seo_title"] as string | null;
  if ("seo_description" in f) out.seo_description = f["seo_description"] as string | null;
  if (Array.isArray(f["slug_aliases"])) out.slug_aliases = f["slug_aliases"] as string[];
  const first = typeof f["first_published_at_utc"] === "string" ? f["first_published_at_utc"] : f["created_at_utc"];
  if (typeof first === "string") out.first_published_at_utc = first;
  if (Array.isArray(f["characteristics"])) out.characteristics = f["characteristics"] as Characteristic[];
  if (Array.isArray(f["documents"])) out.documents = f["documents"] as FamilyDocument[];
  return out;
}

/* Le document a passé la forme C0 (validateSnapshotBytes + Generation) : les champs existent. */
function build(served: ServedGeneration, source: CatalogSource["kind"]): Catalog {
  const doc = served.snapshot as JsonObject;
  const categories = doc["categories"] as unknown as Category[];
  const families: Family[] = (doc["families"] as unknown as (Omit<Family, "items"> & { items: (Omit<Item, "public_family_key" | "windows"> & { public_sell_price_windows: PriceWindow[] })[] })[]).map(
    (f) => ({
      public_family_key: f.public_family_key,
      slug: f.slug,
      name: displayName(f.name), // affichage seulement : la donnée du DTO (c0Generation) reste intacte
      description_short: f.description_short,
      description_long: f.description_long,
      primary_category_key: f.primary_category_key,
      secondary_category_keys: f.secondary_category_keys,
      image_main_sha256: f.image_main_sha256,
      axes: f.axes,
      ...v2Family(f as unknown as Record<string, unknown>),
      items: f.items.map((i) => ({
        public_item_key: i.public_item_key,
        public_family_key: f.public_family_key,
        // Le parseur C0 rend des objets à prototype nul : copie simple (props des composants clients).
        variant_axes: { ...i.variant_axes },
        public_media_refs: i.public_media_refs,
        windows: i.public_sell_price_windows,
        ...(Array.isArray((i as Record<string, unknown>)["characteristics"]) ? { characteristics: (i as Record<string, unknown>)["characteristics"] as Characteristic[] } : {}),
      })),
    }),
  );
  const published = new Map<string, { item: Item; family: Family }>();
  for (const family of families) for (const item of family.items) published.set(item.public_item_key, { item, family });
  const bySlug = new Map<string, Family>();
  for (const family of families) if (!bySlug.has(family.slug)) bySlug.set(family.slug, family);
  const registry = new Map<string, { status: string; superseded_by: string | null }>();
  for (const entry of doc["identity_registry"] as unknown as { public_item_key: string; status: string; superseded_by: string | null }[]) {
    registry.set(entry.public_item_key, entry);
  }
  return {
    c0Generation: { snapshot: served.snapshot, status: served.status },
    meta: {
      source,
      status: served.status,
      data_label: doc["data_label"] as string,
      publication_id: doc["publication_id"] as string,
      projection_id: doc["projection_id"] as string,
      catalogue_sequence: served.catalogue_sequence,
      as_of_utc: doc["as_of_utc"] as string,
      payload_sha256: doc["payload_sha256"] as string,
    },
    categories,
    families,
    resolveItem(key) {
      const entry = registry.get(key);
      if (entry?.status === "SUPERSEDED" && entry.superseded_by) return { kind: "SUPERSEDED", superseded_by: entry.superseded_by };
      if (entry) return { kind: "RETIRED" };
      const hit = published.get(key);
      return hit ? { kind: "PUBLISHED", ...hit } : { kind: "ABSENT" };
    },
    familyBySlug: (slug) => bySlug.get(slug) ?? null,
    familiesInCategory: (key) =>
      families.filter((f) => f.primary_category_key === key || f.secondary_category_keys.includes(key)),
    childCategories: (key) => categories.filter((c) => c.parent_category_key === key),
  };
}

/**
 * Catalogues construits, PAR OBJET document vérifié (W6-P) : le même objet (celui que `lib/site-db/generation.ts`
 * a vérifié et gardé) donne le même catalogue gelé ; un document relu est un nouvel objet, donc reconstruit.
 */
const built = new WeakMap<object, Catalog>();

/** Génération courante ou `CatalogUnavailable` (jamais un catalogue vide servi comme valide). */
export async function loadCatalog(): Promise<Catalog> {
  const source = await getCatalogSource();
  const served = await source.getGeneration();
  if (served === null) throw new CatalogUnavailable("NO_ACTIVE_GENERATION", "Aucune génération ACTIVE servable");
  // UNSAFE (BC2 fail-closed) : aucune page ni prix servi depuis un document non vérifié (C0 §10.1 CATALOG_UNSAFE).
  if (served.status === "UNSAFE" || served.snapshot === null) throw new CatalogUnavailable("CATALOG_UNSAFE", "Génération ACTIVE marquée UNSAFE par la lecture BC2");
  const memo = built.get(served.snapshot as object);
  if (memo !== undefined && memo.meta.source === source.kind && memo.meta.catalogue_sequence === served.catalogue_sequence) return memo;
  const catalog = build(served, source.kind);
  // Catalogue partagé entre requêtes : rien n'y est modifiable (une requête ne peut pas empoisonner la suivante).
  deepFreeze(catalog.families);
  deepFreeze(catalog.categories);
  Object.freeze(catalog.meta);
  Object.freeze(catalog.c0Generation);
  Object.freeze(catalog);
  built.set(served.snapshot as object, catalog);
  return catalog;
}
