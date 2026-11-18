/**
 * Cercle 3 (3.1) — la VUE v1 d'un catalogue v2. Le SITE lit `site_snapshot.v1` et `site_snapshot.v2`. Tout ce qui calcule un prix ou prend une commande (`Generation`, `selectPrice` de c0/,
 * gelé) ne connaît que la forme v1 ; il lit donc cette vue : le même document, privé des clés que seule la v2 porte (le document servi, lui, reste entier pour l'affichage).
 * Fonctions pures, sans dépendance : testées en direct par `tests/nav/v1-view.test.mjs`.
 */
export const SNAPSHOT_V2 = "site_snapshot.v2";
export const SNAPSHOT_V1 = "site_snapshot.v1";

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const pick = (source: Obj, keys: readonly string[]): Obj => Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
const each = (value: unknown, map: (entry: Obj) => Obj): unknown => (Array.isArray(value) ? value.map((entry) => (isObj(entry) ? map(entry) : entry)) : value);

const ENVELOPE = ["contract_version", "publication_id", "projection_id", "catalogue_sequence", "as_of_utc", "generated_at_utc", "scope", "scope_key", "data_label", "basis_digest", "coverage",
  "categories", "families", "media_refs", "manifest_counts", "identity_registry", "payload_sha256"];
const CATEGORY = ["category_key", "name", "parent_category_key"];
const FAMILY = ["public_family_key", "slug", "name", "description_short", "description_long", "primary_category_key", "secondary_category_keys", "image_main_sha256", "axes", "items"];
const ITEM = ["public_item_key", "status", "variant_axes", "public_media_refs", "public_sell_price_windows"];
const WINDOW = ["rate_id", "valid_from_utc", "valid_until_utc", "quantity_min", "quantity_max", "unit_amount", "currency", "tax_basis_or_status", "offer_price_version_public"];
const MEDIA = ["sha256", "mime", "size"];

export function isV2(doc: unknown): boolean {
  return isObj(doc) && doc["contract_version"] === SNAPSHOT_V2;
}

/** Le document v1 correspondant à un document v2 ; un document v1 (ou illisible) est rendu tel quel. */
export function asV1<T>(doc: T): T {
  if (!isV2(doc)) return doc;
  const source = doc as unknown as Obj;
  const view = pick(source, ENVELOPE);
  view["contract_version"] = SNAPSHOT_V1;
  view["categories"] = each(source["categories"], (c) => pick(c, CATEGORY));
  view["families"] = each(source["families"], (f) => ({
    ...pick(f, FAMILY),
    items: each(f["items"], (i) => ({ ...pick(i, ITEM), public_sell_price_windows: each(i["public_sell_price_windows"], (w) => pick(w, WINDOW)) })),
  }));
  view["media_refs"] = each(source["media_refs"], (m) => pick(m, MEDIA));
  return view as unknown as T;
}

/** Ce que le SITE sert comme octets d'un catalogue : sha256 → mime (v2 : dérivés, images sans dérivé, documents ; v1 : les media_refs). Même règle que `servedMedia` du contrat v2. */
export function servedIndex(doc: unknown): Map<string, { mime: string; size: number }> {
  const index = new Map<string, { mime: string; size: number }>();
  if (!isObj(doc)) return index;
  const add = (sha: unknown, mime: unknown, size: unknown) => {
    if (typeof sha === "string" && typeof mime === "string" && typeof size === "number" && !index.has(sha)) index.set(sha, { mime, size });
  };
  for (const media of Array.isArray(doc["media_refs"]) ? doc["media_refs"] : []) {
    if (!isObj(media)) continue;
    const derivatives = isV2(doc) && Array.isArray(media["derivatives"]) ? media["derivatives"] : [];
    if (derivatives.length === 0) add(media["sha256"], media["mime"], media["size"]);
    for (const derivative of derivatives) if (isObj(derivative)) add(derivative["sha256"], derivative["mime"], derivative["size"]);
  }
  if (isV2(doc)) {
    for (const family of Array.isArray(doc["families"]) ? doc["families"] : []) {
      for (const document of isObj(family) && Array.isArray(family["documents"]) ? family["documents"] : []) if (isObj(document)) add(document["sha256"], document["mime"], document["size"]);
    }
  }
  return index;
}
