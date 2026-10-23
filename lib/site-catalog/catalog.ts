/**
 * Vues de lecture dérivées UNIQUEMENT du DTO `site_snapshot.v1` servi par la source
 * de catalogue. Aucune donnée hors DTO, aucun produit cartésien d'axes : seuls les
 * Items publiés existent. Aucun prix calculé ici (la sélection est `selectPrice`).
 */
import type { JsonObject } from "@/c0/ts/src/jsonc";
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
};

export type Category = { category_key: string; name: string; parent_category_key: string | null };

export type Item = {
  public_item_key: string;
  public_family_key: string;
  variant_axes: VariantAxes;
  public_media_refs: string[];
  windows: PriceWindow[];
};

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

/* Le document a passé la forme C0 (validateSnapshotBytes + Generation) : les champs existent. */
function build(served: ServedGeneration, source: CatalogSource["kind"]): Catalog {
  const doc = served.snapshot as JsonObject;
  const categories = doc["categories"] as unknown as Category[];
  const families: Family[] = (doc["families"] as unknown as (Omit<Family, "items"> & { items: (Omit<Item, "public_family_key" | "windows"> & { public_sell_price_windows: PriceWindow[] })[] })[]).map(
    (f) => ({
      public_family_key: f.public_family_key,
      slug: f.slug,
      name: f.name,
      description_short: f.description_short,
      description_long: f.description_long,
      primary_category_key: f.primary_category_key,
      secondary_category_keys: f.secondary_category_keys,
      image_main_sha256: f.image_main_sha256,
      axes: f.axes,
      items: f.items.map((i) => ({
        public_item_key: i.public_item_key,
        public_family_key: f.public_family_key,
        // Le parseur C0 rend des objets à prototype nul : copie simple (props des composants clients).
        variant_axes: { ...i.variant_axes },
        public_media_refs: i.public_media_refs,
        windows: i.public_sell_price_windows,
      })),
    }),
  );
  const published = new Map<string, { item: Item; family: Family }>();
  for (const family of families) for (const item of family.items) published.set(item.public_item_key, { item, family });
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
    familyBySlug: (slug) => families.find((f) => f.slug === slug) ?? null,
    familiesInCategory: (key) =>
      families.filter((f) => f.primary_category_key === key || f.secondary_category_keys.includes(key)),
    childCategories: (key) => categories.filter((c) => c.parent_category_key === key),
  };
}

/** Génération courante ou `CatalogUnavailable` (jamais un catalogue vide servi comme valide). */
export async function loadCatalog(): Promise<Catalog> {
  const source = await getCatalogSource();
  const served = await source.getGeneration();
  if (served === null) throw new CatalogUnavailable("NO_ACTIVE_GENERATION", "Aucune génération ACTIVE servable");
  // UNSAFE (BC2 fail-closed) : aucune page ni prix servi depuis un document non vérifié (C0 §10.1 CATALOG_UNSAFE).
  if (served.status === "UNSAFE" || served.snapshot === null) throw new CatalogUnavailable("CATALOG_UNSAFE", "Génération ACTIVE marquée UNSAFE par la lecture BC2");
  return build(served, source.kind);
}
