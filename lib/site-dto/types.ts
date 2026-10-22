// Types du payload site_snapshot PROVISOIRE (fixture BC1, contract_version
// « site_snapshot.PROVISIONAL_v0_BC1_SPIKE »). Ce fichier décrit la fixture
// telle quelle ; il sera remplacé par les types du contrat C0 gelé (BC0).

export type VariantAxes = Record<string, string>;

export type PriceWindow = {
  currency: string;
  layer: string; // "BASE" | "PROMO" dans la fixture
  offer_price_version_public: string;
  quantity_min: number;
  quantity_max: number | null;
  rate_id: string;
  tax_basis_or_status: string;
  unit_amount: string; // chaîne décimale, jamais un Number comme vérité
  valid_from_utc: string;
  valid_until_utc: string | null; // fenêtre [from, until)
};

export type MediaRef = {
  mime: string;
  sha256: string;
  size: number;
  role?: string;
};

export type SnapshotItem = {
  public_item_key: string;
  public_media_refs: MediaRef[];
  public_sell_price_windows: PriceWindow[];
  status: string;
  variant_axes: VariantAxes;
};

export type AxisSchema = { axis: string; values: string[] };

export type SnapshotFamily = {
  public_family_key: string;
  slug: string;
  name: string;
  description_short: string;
  description_long: string;
  image_main_sha256: string;
  primary_category_key: string;
  secondary_category_keys: string[];
  variant_axes_schema: AxisSchema[];
  forbidden_combinations?: VariantAxes[];
  unpublished_note?: string;
  items: SnapshotItem[];
};

export type SnapshotCategory = {
  category_key: string;
  name: string;
  parent: string | null;
};

export type SiteSnapshot = {
  contract_version: string;
  fixture_status: string;
  as_of_utc: string;
  generated_at_utc: string;
  catalogue_sequence: number;
  publication_id: string;
  projection_id: string;
  scope: string;
  scope_key: string;
  categories: SnapshotCategory[];
  families: SnapshotFamily[];
  media_refs: MediaRef[];
  manifest_counts: { families: number; items: number; media: number };
};

// ---- Vues exposées aux composants (dérivées, sans calcul de prix) ----

export type CategoryView = {
  category_key: string;
  slug: string;
  name: string;
  parent_key: string | null;
  family_count: number;
};

export type ItemView = {
  public_item_key: string;
  variant_axes: VariantAxes;
  media_urls: string[];
  windows: PriceWindow[];
};

export type FamilyView = {
  public_family_key: string;
  slug: string;
  name: string;
  description_short: string;
  description_long: string;
  image_main_url: string;
  primary_category_key: string;
  category_keys: string[];
  variant_axes_schema: AxisSchema[];
  forbidden_combinations: VariantAxes[];
  items: ItemView[]; // items READY uniquement
};

export type SnapshotMeta = {
  contract_version: string;
  fixture_status: string;
  publication_id: string;
  projection_id: string;
  as_of_utc: string;
};

export type PriceSelection = {
  rate_id: string;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  layer: string;
  offer_price_version_public: string;
};

export type PriceResult =
  | { ok: true; price: PriceSelection }
  | {
      ok: false;
      code: "PRICE_WINDOW_UNAVAILABLE" | "PRICE_WINDOW_AMBIGUOUS" | "INVALID_VARIANT";
      detail: string;
    };
