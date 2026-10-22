/**
 * Adaptateur DTO unique du spike BC1-D.
 *
 * SEUL module qui lit la fixture provisoire `fixtures/provisional-v0/`
 * (contract_version site_snapshot.PROVISIONAL_v0_BC1_SPIKE, STAGING_FIXTURE).
 * Il est écrit pour être remplacé par le contrat C0 gelé (BC0) : les pages et
 * les routes ne connaissent que les types exportés ici.
 *
 * Règles : SÉLECTION de prix uniquement (aucun calcul PBQ, remise, marge, TVA,
 * port). Montants manipulés en chaînes décimales ou en centimes BigInt.
 * Serveur uniquement (lit le disque).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// ── Types exposés (forme lisible par les pages) ──────────────────────────────

export type VariantAxes = Record<string, string>;

export type Category = { category_key: string; name: string; parent: string | null };

export type SellWindow = {
  rate_id: string;
  layer: string; // "BASE" | "PROMO" dans la fixture
  currency: string;
  unit_amount: string; // chaîne décimale, jamais Number comme vérité
  tax_basis_or_status: string;
  quantity_min: number;
  quantity_max: number | null;
  valid_from_utc: string;
  valid_until_utc: string | null; // borne exclusive [from, until)
  offer_price_version_public: string;
};

export type MediaRef = { sha256: string; mime: string; size: number; role?: string };

export type Item = {
  public_item_key: string;
  family_key: string;
  status: string;
  variant_axes: VariantAxes;
  media: MediaRef[];
  windows: SellWindow[];
};

export type AxisSchema = { axis: string; values: string[] };

export type Family = {
  public_family_key: string;
  slug: string;
  name: string;
  description_short: string;
  description_long: string;
  primary_category_key: string;
  secondary_category_keys: string[];
  image_main_sha256: string | null;
  variant_axes_schema: AxisSchema[];
  forbidden_combinations: VariantAxes[];
  items: Item[]; // items READY seulement
};

export type SnapshotMeta = {
  contract_version: string;
  fixture_status: string;
  publication_id: string;
  projection_id: string;
  scope_key: string;
  as_of_utc: string;
  payload_sha256: string;
};

export type PriceSelection = {
  rate_id: string;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  layer: string;
  valid_from_utc: string;
  valid_until_utc: string | null;
};

export type DtoErrorCode =
  | "INVALID_VARIANT"
  | "PRICE_WINDOW_UNAVAILABLE"
  | "INVALID_QUANTITY"
  | "AMBIGUOUS_PRICE_WINDOW";

export class DtoError extends Error {
  constructor(
    public readonly code: DtoErrorCode,
    message: string,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ── Chargement et vérification de la fixture ─────────────────────────────────

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "provisional-v0");
const PAYLOAD_FILE = "site_snapshot_provisional_v0.json";
const EXPECTED_SHA256 = "413dab48b70a19a10b89b398aa04f049358bda94d985d20b6d61710fb596e909";
const EXPECTED_CONTRACT = "site_snapshot.PROVISIONAL_v0_BC1_SPIKE";

type Loaded = {
  meta: SnapshotMeta;
  categories: Category[];
  families: Family[];
  itemsByKey: Map<string, Item>;
  mediaFiles: Map<string, { file: string; mime: string }>;
};

let cache: Loaded | null = null;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function load(): Loaded {
  if (cache) return cache;
  const raw = readFileSync(path.join(FIXTURE_DIR, PAYLOAD_FILE));
  const digest = sha256(raw);
  if (digest !== EXPECTED_SHA256) {
    throw new Error(`Fixture altérée : sha256 ${digest} ≠ ${EXPECTED_SHA256}`);
  }
  const p: any = JSON.parse(raw.toString("utf8"));
  if (p.contract_version !== EXPECTED_CONTRACT) {
    throw new Error(`contract_version inattendu : ${p.contract_version}`);
  }

  const families: Family[] = (p.families as any[]).map((f) => ({
    public_family_key: f.public_family_key,
    slug: f.slug,
    name: f.name,
    description_short: f.description_short,
    description_long: f.description_long,
    primary_category_key: f.primary_category_key,
    secondary_category_keys: f.secondary_category_keys ?? [],
    image_main_sha256: f.image_main_sha256 ?? null,
    variant_axes_schema: f.variant_axes_schema ?? [],
    forbidden_combinations: f.forbidden_combinations ?? [],
    items: (f.items as any[])
      .filter((i) => i.status === "READY")
      .map((i) => ({
        public_item_key: i.public_item_key,
        family_key: f.public_family_key,
        status: i.status,
        variant_axes: i.variant_axes ?? {},
        media: i.public_media_refs ?? [],
        windows: i.public_sell_price_windows ?? [],
      })),
  }));

  const itemsByKey = new Map<string, Item>();
  for (const f of families) for (const i of f.items) itemsByKey.set(i.public_item_key, i);

  // Les médias sont référencés par sha256 : on indexe les octets réels.
  const declared = new Map<string, string>();
  for (const m of p.media_refs as any[]) declared.set(m.sha256, m.mime);
  const mediaFiles = new Map<string, { file: string; mime: string }>();
  const mediaDir = path.join(FIXTURE_DIR, "media");
  for (const name of readdirSync(mediaDir)) {
    const file = path.join(mediaDir, name);
    const h = sha256(readFileSync(file));
    const mime = declared.get(h);
    if (mime) mediaFiles.set(h, { file, mime });
  }

  cache = {
    meta: {
      contract_version: p.contract_version,
      fixture_status: p.fixture_status,
      publication_id: p.publication_id,
      projection_id: p.projection_id,
      scope_key: p.scope_key,
      as_of_utc: p.as_of_utc,
      payload_sha256: digest,
    },
    categories: p.categories,
    families,
    itemsByKey,
    mediaFiles,
  };
  return cache;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Instant de référence ─────────────────────────────────────────────────────

export const DEFAULT_NOW_UTC = "2026-10-22T20:00:00Z";

/** Instant injectable par SPIKE_NOW_UTC (lu à chaque appel). */
export function nowUtc(): string {
  const v = process.env.SPIKE_NOW_UTC || DEFAULT_NOW_UTC;
  if (Number.isNaN(Date.parse(v))) throw new Error(`SPIKE_NOW_UTC invalide : ${v}`);
  return new Date(v).toISOString();
}

// ── Lecture catalogue ────────────────────────────────────────────────────────

export function getSnapshotMeta(): SnapshotMeta {
  return load().meta;
}
export function getCategories(): Category[] {
  return load().categories;
}
export function getFamilies(): Family[] {
  return load().families;
}
export function getFamilyBySlug(slug: string): Family | null {
  return load().families.find((f) => f.slug === slug) ?? null;
}
export function getFamiliesByCategory(categoryKey: string): Family[] {
  return load().families.filter(
    (f) => f.primary_category_key === categoryKey || f.secondary_category_keys.includes(categoryKey),
  );
}
export function getItem(itemKey: string): Item | null {
  return load().itemsByKey.get(itemKey) ?? null;
}
export function getMedia(sha: string): { file: string; mime: string } | null {
  return load().mediaFiles.get(sha) ?? null;
}

// ── Variantes ────────────────────────────────────────────────────────────────

function sameAxes(a: VariantAxes, b: VariantAxes): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

export function isForbidden(family: Family, axes: VariantAxes): boolean {
  return family.forbidden_combinations.some((c) => Object.entries(c).every(([k, v]) => axes[k] === v));
}

/**
 * Résout un item à partir de sa clé ET de ses axes de variante.
 * INVALID_VARIANT si : clé inconnue/non READY, combinaison interdite, axes
 * qui ne correspondent pas à l'item publié (combinaison absente).
 */
export function resolveVariant(itemKey: string, axes: VariantAxes): Item {
  const item = getItem(itemKey);
  if (!item) {
    throw new DtoError("INVALID_VARIANT", "Item inconnu ou non publié", { public_item_key: itemKey });
  }
  const family = load().families.find((f) => f.public_family_key === item.family_key)!;
  if (isForbidden(family, axes)) {
    throw new DtoError("INVALID_VARIANT", "Combinaison interdite", {
      public_item_key: itemKey,
      reason: "FORBIDDEN_COMBINATION",
      variant_axes: axes,
    });
  }
  if (!sameAxes(item.variant_axes, axes)) {
    throw new DtoError("INVALID_VARIANT", "Combinaison absente pour cet item", {
      public_item_key: itemKey,
      reason: "ABSENT_COMBINATION",
      variant_axes: axes,
      published_axes: item.variant_axes,
    });
  }
  return item;
}

// ── Sélection de prix ────────────────────────────────────────────────────────

/**
 * Priorité de couche (HYPOTHÈSE DU SPIKE, à fermer par C0) : une fenêtre PROMO
 * applicable l'emporte sur une fenêtre BASE applicable. Ce n'est pas un calcul
 * de remise : le montant est pris tel quel dans la fenêtre sélectionnée.
 */
const LAYER_PRIORITY = ["PROMO", "BASE"] as const;

export function windowState(w: SellWindow, instantUtc: string): "ACTIVE" | "FUTURE" | "EXPIRED" {
  const t = Date.parse(instantUtc);
  if (t < Date.parse(w.valid_from_utc)) return "FUTURE";
  if (w.valid_until_utc !== null && t >= Date.parse(w.valid_until_utc)) return "EXPIRED";
  return "ACTIVE";
}

export function selectPrice(itemKey: string, quantity: number, instantUtc: string): PriceSelection {
  const item = getItem(itemKey);
  if (!item) throw new DtoError("INVALID_VARIANT", "Item inconnu ou non publié", { public_item_key: itemKey });
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new DtoError("INVALID_QUANTITY", "Quantité entière positive attendue", { quantity });
  }
  const applicable = item.windows.filter(
    (w) =>
      windowState(w, instantUtc) === "ACTIVE" &&
      quantity >= w.quantity_min &&
      (w.quantity_max === null || quantity <= w.quantity_max),
  );
  for (const layer of LAYER_PRIORITY) {
    const hits = applicable.filter((w) => w.layer === layer);
    if (hits.length > 1) {
      throw new DtoError("AMBIGUOUS_PRICE_WINDOW", "Plusieurs fenêtres de même couche", {
        public_item_key: itemKey,
        rate_ids: hits.map((h) => h.rate_id),
      });
    }
    const w = hits[0];
    if (w) {
      return {
        rate_id: w.rate_id,
        unit_amount: w.unit_amount,
        currency: w.currency,
        tax_basis_or_status: w.tax_basis_or_status,
        layer: w.layer,
        valid_from_utc: w.valid_from_utc,
        valid_until_utc: w.valid_until_utc,
      };
    }
  }
  throw new DtoError("PRICE_WINDOW_UNAVAILABLE", "Aucune fenêtre de prix pour cette quantité à cet instant", {
    public_item_key: itemKey,
    quantity,
    instant_utc: instantUtc,
  });
}

// ── Montants décimaux (centimes BigInt) ──────────────────────────────────────

const DECIMAL = /^\d{1,12}(\.\d{1,2})?$/;

export function toCents(amount: string): bigint {
  if (typeof amount !== "string" || !DECIMAL.test(amount)) throw new Error(`Montant non décimal : ${amount}`);
  const [ent, dec = ""] = amount.split(".");
  return BigInt(ent!) * 100n + BigInt((dec + "00").slice(0, 2));
}

export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

export function isDecimalString(v: unknown): v is string {
  return typeof v === "string" && DECIMAL.test(v);
}
