/**
 * Simulateur contractuel devis / commande (spike BC1-D).
 *
 * NE PERSISTE RIEN de réel : mémoire de processus uniquement. Chaque réponse
 * porte `simulation: true` et `persistence: "NONE_CONTRACTUAL_SIMULATION"`.
 * Le serveur revalide CHAQUE ligne affichée contre le snapshot (adaptateur
 * DTO unique) à l'instant SPIKE_NOW_UTC.
 */
import { createHash } from "node:crypto";
import {
  DtoError,
  fromCents,
  getSnapshotMeta,
  isDecimalString,
  nowUtc,
  resolveVariant,
  selectPrice,
  toCents,
  type VariantAxes,
} from "@/lib/site-dto";

export const SIMULATION_LABEL = {
  simulation: true,
  persistence: "NONE_CONTRACTUAL_SIMULATION",
} as const;

export type SubmittedLine = {
  public_item_key: string;
  variant_axes: VariantAxes;
  quantity: number;
  rate_id: string;
  unit_amount: string;
};

export type LineError = { index: number; code: string; message: string; detail?: Record<string, unknown> };

export type ValidatedLine = SubmittedLine & {
  currency: string;
  tax_basis_or_status: string;
  layer: string;
  line_amount: string; // quantity × unit_amount, exact en centimes
};

export type ValidationResult =
  | { ok: true; lines: ValidatedLine[]; currency: string; total_amount: string; instant_utc: string }
  | { ok: false; status: number; error: string; errors: LineError[]; instant_utc: string };

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_REQUEST: 400,
  INVALID_LINE: 400,
  INVALID_QUANTITY: 400,
  INVALID_VARIANT: 400,
  EMPTY_CART: 400,
  PRICE_WINDOW_UNAVAILABLE: 409,
  AMBIGUOUS_PRICE_WINDOW: 409,
  PRICE_CHANGED: 409,
  MIXED_CURRENCY_NOT_QUALIFIED: 409,
};

function isAxes(v: unknown): v is VariantAxes {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x === "string")
  );
}

/**
 * Revalide les lignes. `checkDisplayed=false` sert à l'aperçu de panier
 * (pas encore de rate_id/montant affiché) ; devis et commande l'exigent.
 */
export function validateLines(raw: unknown, checkDisplayed: boolean): ValidationResult {
  const instant = nowUtc();
  const errors: LineError[] = [];
  if (!Array.isArray(raw)) {
    return { ok: false, status: 400, error: "INVALID_REQUEST", errors: [{ index: -1, code: "INVALID_REQUEST", message: "lines[] attendu" }], instant_utc: instant };
  }
  if (raw.length === 0) {
    return { ok: false, status: 400, error: "EMPTY_CART", errors: [{ index: -1, code: "EMPTY_CART", message: "Aucune ligne" }], instant_utc: instant };
  }
  const lines: ValidatedLine[] = [];
  raw.forEach((l: unknown, index) => {
    const line = l as Partial<SubmittedLine> | null;
    if (
      !line ||
      typeof line.public_item_key !== "string" ||
      !isAxes(line.variant_axes) ||
      typeof line.quantity !== "number" ||
      (checkDisplayed && (typeof line.rate_id !== "string" || !isDecimalString(line.unit_amount)))
    ) {
      errors.push({ index, code: "INVALID_LINE", message: "Ligne incomplète ou mal typée" });
      return;
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) {
      errors.push({ index, code: "INVALID_QUANTITY", message: "Quantité entière positive attendue" });
      return;
    }
    try {
      resolveVariant(line.public_item_key, line.variant_axes);
      const sel = selectPrice(line.public_item_key, line.quantity, instant);
      if (checkDisplayed && (sel.rate_id !== line.rate_id || toCents(sel.unit_amount) !== toCents(line.unit_amount!))) {
        errors.push({
          index,
          code: "PRICE_CHANGED",
          message: "Le prix affiché ne correspond plus au snapshot",
          detail: { submitted: { rate_id: line.rate_id, unit_amount: line.unit_amount }, current: { rate_id: sel.rate_id, unit_amount: sel.unit_amount } },
        });
        return;
      }
      lines.push({
        public_item_key: line.public_item_key,
        variant_axes: line.variant_axes,
        quantity: line.quantity,
        rate_id: sel.rate_id,
        unit_amount: sel.unit_amount,
        currency: sel.currency,
        tax_basis_or_status: sel.tax_basis_or_status,
        layer: sel.layer,
        line_amount: fromCents(toCents(sel.unit_amount) * BigInt(line.quantity)),
      });
    } catch (e) {
      if (e instanceof DtoError) errors.push({ index, code: e.code, message: e.message, detail: e.detail });
      else throw e;
    }
  });
  if (errors.length > 0) {
    // Statut : 400 si une erreur de forme/variante existe, sinon 409.
    const status = Math.min(...errors.map((e) => STATUS_BY_CODE[e.code] ?? 400));
    const first = errors.find((e) => (STATUS_BY_CODE[e.code] ?? 400) === status)!;
    return { ok: false, status, error: first.code, errors, instant_utc: instant };
  }
  const currencies = new Set(lines.map((l) => l.currency));
  if (currencies.size !== 1) {
    return { ok: false, status: 409, error: "MIXED_CURRENCY_NOT_QUALIFIED", errors: [{ index: -1, code: "MIXED_CURRENCY_NOT_QUALIFIED", message: "Plusieurs devises : non qualifié" }], instant_utc: instant };
  }
  const total = lines.reduce((acc, l) => acc + toCents(l.line_amount), 0n);
  return { ok: true, lines, currency: [...currencies][0]!, total_amount: fromCents(total), instant_utc: instant };
}

// ── Idempotence (mémoire de processus) ───────────────────────────────────────

type Stored = { payload_hash: string; receipt: Record<string, unknown> };
const g = globalThis as unknown as { __bc1dReceipts?: Map<string, Stored> };
const store: Map<string, Stored> = (g.__bc1dReceipts ??= new Map());

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export type Kind = "QUOTE_REQUEST" | "ORDER";

function validContact(c: unknown): c is { name: string; email: string; organisation?: string } {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    o.name.trim().length > 0 &&
    typeof o.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email) &&
    (o.organisation === undefined || typeof o.organisation === "string")
  );
}

/** Traite une requête devis/commande. Retourne { status, body }. */
export function simulate(kind: Kind, body: unknown): { status: number; body: Record<string, unknown> } {
  const b = (body ?? {}) as Record<string, unknown>;
  const key = b.idempotency_key;
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    return { status: 400, body: { ...SIMULATION_LABEL, kind, error: "IDEMPOTENCY_KEY_REQUIRED" } };
  }
  const payloadHash = createHash("sha256").update(canonical(b)).digest("hex");
  const storeKey = `${kind}:${key}`;
  const prior = store.get(storeKey);
  if (prior) {
    if (prior.payload_hash === payloadHash) return { status: 200, body: { ...prior.receipt, replayed: true } };
    return { status: 409, body: { ...SIMULATION_LABEL, kind, error: "DUPLICATE_KEY_DIFFERENT_PAYLOAD", idempotency_key: key } };
  }
  if (!validContact(b.contact)) {
    return { status: 400, body: { ...SIMULATION_LABEL, kind, error: "INVALID_CONTACT" } };
  }
  const v = validateLines(b.lines, true);
  if (!v.ok) {
    return { status: v.status, body: { ...SIMULATION_LABEL, kind, error: v.error, errors: v.errors, instant_utc: v.instant_utc } };
  }
  const meta = getSnapshotMeta();
  const receipt = {
    ...SIMULATION_LABEL,
    kind,
    receipt_id: `SIM-${kind === "ORDER" ? "CMD" : "DEV"}-${payloadHash.slice(0, 16)}`,
    idempotency_key: key,
    instant_utc: v.instant_utc,
    snapshot: {
      contract_version: meta.contract_version,
      publication_id: meta.publication_id,
      projection_id: meta.projection_id,
      payload_sha256: meta.payload_sha256,
    },
    lines: v.lines,
    currency: v.currency,
    total_amount: v.total_amount,
    total_basis: "HT — somme exacte des lignes (centimes)",
    not_qualified: ["TVA", "frais de port", "remise", "arrondi fiscal"],
    contact_received: true,
  };
  store.set(storeKey, { payload_hash: payloadHash, receipt });
  return { status: 200, body: { ...receipt, replayed: false } };
}
