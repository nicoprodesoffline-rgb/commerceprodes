// ADAPTATEUR DTO UNIQUE — seul module qui lit la fixture site_snapshot.
// Fixture PROVISOIRE (STAGING_FIXTURE) : ce module est écrit pour être remplacé
// par le lecteur du contrat C0 gelé ; aucune autre partie du code ne lit le JSON.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectWindow } from "./pricing";
import { resolveVariant as resolveVariantPure } from "./variants";
import type {
  CategoryView,
  FamilyView,
  ItemView,
  PriceResult,
  SiteSnapshot,
  SnapshotMeta,
  VariantAxes,
} from "./types";

export type * from "./types";

const FIXTURE_DIR = join(process.cwd(), "fixtures", "provisional-v0");
const SNAPSHOT_FILE = "site_snapshot_provisional_v0.json";
const EXPECTED_SNAPSHOT_SHA256 =
  "413dab48b70a19a10b89b398aa04f049358bda94d985d20b6d61710fb596e909";
const DEFAULT_NOW_UTC = "2026-10-22T20:00:00Z";
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

type Loaded = {
  snapshot: SiteSnapshot;
  families: FamilyView[];
  categories: CategoryView[];
  media: Map<string, { file: string; mime: string }>;
};

let cache: Loaded | null = null;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function mediaUrl(sha: string): string {
  return `/media/${sha}`;
}

function load(): Loaded {
  if (cache) return cache;
  const raw = readFileSync(join(FIXTURE_DIR, SNAPSHOT_FILE));
  const got = sha256(raw);
  if (got !== EXPECTED_SNAPSHOT_SHA256) {
    throw new Error(`site_snapshot: empreinte inattendue ${got} (fixture modifiée ?)`);
  }
  const snapshot = JSON.parse(raw.toString("utf8")) as SiteSnapshot;

  // Index des médias : chaque fichier media/*.png est vérifié contre son SHA.
  const media = new Map<string, { file: string; mime: string }>();
  const manifest = readFileSync(join(FIXTURE_DIR, "MANIFEST.sha256"), "utf8");
  for (const line of manifest.split("\n")) {
    const m = /^([0-9a-f]{64})\s+(media\/\S+)$/.exec(line.trim());
    if (!m) continue;
    const file = join(FIXTURE_DIR, m[2]!);
    if (sha256(readFileSync(file)) !== m[1]) throw new Error(`média corrompu: ${m[2]}`);
    media.set(m[1]!, { file, mime: "image/png" });
  }
  for (const ref of snapshot.media_refs) {
    if (!media.has(ref.sha256)) throw new Error(`média référencé absent: ${ref.sha256}`);
  }

  const families: FamilyView[] = snapshot.families.map((f) => ({
    public_family_key: f.public_family_key,
    slug: f.slug,
    name: f.name,
    description_short: f.description_short,
    description_long: f.description_long,
    image_main_url: mediaUrl(f.image_main_sha256),
    primary_category_key: f.primary_category_key,
    category_keys: [f.primary_category_key, ...f.secondary_category_keys],
    variant_axes_schema: f.variant_axes_schema,
    forbidden_combinations: f.forbidden_combinations ?? [],
    items: f.items
      .filter((i) => i.status === "READY")
      .map(
        (i): ItemView => ({
          public_item_key: i.public_item_key,
          variant_axes: i.variant_axes,
          media_urls: i.public_media_refs.map((r) => mediaUrl(r.sha256)),
          windows: i.public_sell_price_windows,
        }),
      ),
  }));

  const categories: CategoryView[] = snapshot.categories.map((c) => ({
    category_key: c.category_key,
    slug: c.category_key.toLowerCase(),
    name: c.name,
    parent_key: c.parent,
    family_count: families.filter((f) => f.category_keys.includes(c.category_key)).length,
  }));

  cache = { snapshot, families, categories, media };
  return cache;
}

// ---- Instant de référence (injectable) ----

export function getNowUtc(): string {
  const v = process.env.SPIKE_NOW_UTC ?? DEFAULT_NOW_UTC;
  if (!ISO_UTC_RE.test(v)) throw new Error(`SPIKE_NOW_UTC invalide: ${v}`);
  return v;
}

// ---- Lecture catalogue ----

export function getSnapshotMeta(): SnapshotMeta {
  const s = load().snapshot;
  return {
    contract_version: s.contract_version,
    fixture_status: s.fixture_status,
    publication_id: s.publication_id,
    projection_id: s.projection_id,
    as_of_utc: s.as_of_utc,
  };
}

export function getCategories(): CategoryView[] {
  return load().categories;
}

export function getCategoryBySlug(slug: string): CategoryView | undefined {
  return load().categories.find((c) => c.slug === slug);
}

export function getFamilies(): FamilyView[] {
  return load().families;
}

export function getFamiliesInCategory(categoryKey: string): FamilyView[] {
  return load().families.filter((f) => f.category_keys.includes(categoryKey));
}

export function getFamilyBySlug(slug: string): FamilyView | undefined {
  return load().families.find((f) => f.slug === slug);
}

export function getReadyItems(): { family: FamilyView; item: ItemView }[] {
  return load().families.flatMap((family) => family.items.map((item) => ({ family, item })));
}

export function findItem(itemKey: string): { family: FamilyView; item: ItemView } | undefined {
  return getReadyItems().find((r) => r.item.public_item_key === itemKey);
}

export function getMediaFile(sha: string): { file: string; mime: string } | undefined {
  return load().media.get(sha);
}

// ---- Variante et prix ----

export function resolveVariant(familyKey: string, axes: VariantAxes) {
  const family = load().families.find((f) => f.public_family_key === familyKey);
  if (!family) return { ok: false as const, reason: "ABSENT" as const };
  return resolveVariantPure(family, axes);
}

/** Sélection seulement : renvoie la fenêtre SELL applicable, ou une erreur. */
export function selectPrice(itemKey: string, quantity: number, instantUtc: string): PriceResult {
  const found = findItem(itemKey);
  if (!found) {
    return { ok: false, code: "INVALID_VARIANT", detail: `item ${itemKey} absent ou non READY` };
  }
  return selectWindow(found.item.windows, quantity, instantUtc);
}
