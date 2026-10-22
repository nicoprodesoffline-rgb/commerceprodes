// SIMULATEUR CONTRACTUEL devis/commande (BC1). Aucune persistance réelle :
// mémoire du processus uniquement (perdue au redémarrage). BC4 n'existe pas.
// Le serveur revalide CHAQUE ligne affichée contre le snapshot à SPIKE_NOW_UTC.
import { createHash, randomUUID } from "node:crypto";
import { findItem, getNowUtc, getSnapshotMeta, selectPrice } from "lib/site-dto";
import { isDecimalAmount, multiplyAmount, sumAmounts, toCents } from "lib/site-dto/pricing";
import { isForbidden, sameAxes } from "lib/site-dto/variants";

export const SIMULATION_LABEL = {
  simulation: true,
  persistence: "NONE_CONTRACTUAL_SIMULATION",
} as const;

export type Kind = "QUOTE" | "ORDER";

type ErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_IDEMPOTENCY_KEY"
  | "INVALID_QUANTITY"
  | "DUPLICATE_LINE"
  | "INVALID_VARIANT"
  | "PRICE_WINDOW_UNAVAILABLE"
  | "PRICE_WINDOW_AMBIGUOUS"
  | "PRICE_CHANGED"
  | "DUPLICATE_KEY_DIFFERENT_PAYLOAD";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  MISSING_IDEMPOTENCY_KEY: 400,
  INVALID_QUANTITY: 400,
  DUPLICATE_LINE: 400,
  INVALID_VARIANT: 400,
  PRICE_WINDOW_UNAVAILABLE: 409,
  PRICE_WINDOW_AMBIGUOUS: 409,
  PRICE_CHANGED: 409,
  DUPLICATE_KEY_DIFFERENT_PAYLOAD: 409,
};

type LineError = { line: number; code: ErrorCode; detail: string; expected?: unknown };

export type SimResult = { status: number; body: Record<string, unknown> };

type StoredReceipt = { payloadHash: string; receipt: Record<string, unknown> };

// Mémoire de processus. Clé = `${kind}:${idempotency_key}`.
const g = globalThis as unknown as { __bc1Receipts?: Map<string, StoredReceipt> };
const receipts: Map<string, StoredReceipt> = (g.__bc1Receipts ??= new Map());

function fail(code: ErrorCode, detail: string, extra: Record<string, unknown> = {}): SimResult {
  return { status: STATUS[code], body: { ...SIMULATION_LABEL, ok: false, error: { code, detail }, ...extra } };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return isPlainObject(v) && Object.values(v).every((x) => typeof x === "string");
}

export function simulate(kind: Kind, body: unknown): SimResult {
  if (!isPlainObject(body)) return fail("INVALID_REQUEST", "corps JSON objet attendu");
  const key = body.idempotency_key;
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    return fail("MISSING_IDEMPOTENCY_KEY", "idempotency_key obligatoire (8 à 128 caractères)");
  }
  const contact = body.contact;
  if (
    !isPlainObject(contact) ||
    typeof contact.name !== "string" ||
    contact.name.trim().length === 0 ||
    typeof contact.email !== "string" ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)
  ) {
    return fail("INVALID_REQUEST", "contact.name et contact.email valides obligatoires");
  }
  const lines = body.lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    return fail("INVALID_REQUEST", "lines : tableau de 1 à 100 lignes attendu");
  }

  // Idempotence : même clé + même payload -> même reçu ; payload différent -> 409.
  const payloadHash = createHash("sha256")
    .update(canonical({ kind, contact, lines, note: body.note ?? null }))
    .digest("hex");
  const stored = receipts.get(`${kind}:${key}`);
  if (stored) {
    if (stored.payloadHash === payloadHash) {
      return { status: 200, body: { ...stored.receipt, idempotent_replay: true } };
    }
    return fail("DUPLICATE_KEY_DIFFERENT_PAYLOAD", "clé déjà utilisée avec un autre payload");
  }

  const now = getNowUtc();
  const errors: LineError[] = [];
  const accepted: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, idx) => {
    if (!isPlainObject(raw)) {
      errors.push({ line: idx, code: "INVALID_REQUEST", detail: "ligne objet attendue" });
      return;
    }
    const { public_item_key, variant_axes, quantity, rate_id, unit_amount } = raw;
    if (
      typeof public_item_key !== "string" ||
      !isStringRecord(variant_axes) ||
      typeof rate_id !== "string" ||
      !isDecimalAmount(unit_amount)
    ) {
      errors.push({
        line: idx,
        code: "INVALID_REQUEST",
        detail: "public_item_key, variant_axes, rate_id, unit_amount (chaîne décimale) obligatoires",
      });
      return;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      errors.push({ line: idx, code: "INVALID_QUANTITY", detail: "quantité entière de 1 à 100000" });
      return;
    }
    if (seen.has(public_item_key)) {
      errors.push({ line: idx, code: "DUPLICATE_LINE", detail: `${public_item_key} en double` });
      return;
    }
    seen.add(public_item_key);

    const found = findItem(public_item_key);
    if (!found) {
      errors.push({ line: idx, code: "INVALID_VARIANT", detail: `item ${public_item_key} absent ou non READY` });
      return;
    }
    if (isForbidden(found.family, variant_axes)) {
      errors.push({ line: idx, code: "INVALID_VARIANT", detail: "combinaison interdite" });
      return;
    }
    if (!sameAxes(found.item.variant_axes, variant_axes)) {
      errors.push({
        line: idx,
        code: "INVALID_VARIANT",
        detail: "variant_axes ne correspond pas à l'item",
        expected: found.item.variant_axes,
      });
      return;
    }
    const sel = selectPrice(public_item_key, quantity, now);
    if (!sel.ok) {
      errors.push({ line: idx, code: sel.code, detail: sel.detail });
      return;
    }
    if (sel.price.rate_id !== rate_id || toCents(sel.price.unit_amount) !== toCents(unit_amount)) {
      errors.push({
        line: idx,
        code: "PRICE_CHANGED",
        detail: "le prix affiché ne correspond pas au snapshot à l'instant serveur",
        expected: { rate_id: sel.price.rate_id, unit_amount: sel.price.unit_amount },
      });
      return;
    }
    accepted.push({
      public_item_key,
      public_family_key: found.family.public_family_key,
      variant_axes,
      quantity,
      rate_id: sel.price.rate_id,
      layer: sel.price.layer,
      offer_price_version_public: sel.price.offer_price_version_public,
      unit_amount: sel.price.unit_amount,
      currency: sel.price.currency,
      tax_basis_or_status: sel.price.tax_basis_or_status,
      line_amount: multiplyAmount(sel.price.unit_amount, quantity),
    });
  });

  if (errors.length > 0) {
    // Priorité : erreurs 400 (requête/variante) avant 409 (prix/fenêtre).
    const first = errors.find((e) => STATUS[e.code] === 400) ?? errors[0]!;
    return {
      status: STATUS[first.code],
      body: {
        ...SIMULATION_LABEL,
        ok: false,
        as_of_utc: now,
        error: { code: first.code, detail: first.detail },
        line_errors: errors,
      },
    };
  }

  const currencies = [...new Set(accepted.map((l) => l.currency as string))];
  const totals = currencies.map((currency) => ({
    currency,
    tax_basis_or_status: [...new Set(accepted.filter((l) => l.currency === currency).map((l) => l.tax_basis_or_status))].join("|"),
    lines_amount: sumAmounts(accepted.filter((l) => l.currency === currency).map((l) => l.line_amount as string)),
  }));

  const receipt = {
    ...SIMULATION_LABEL,
    ok: true,
    kind,
    receipt_id: `SIM-${kind}-${randomUUID()}`,
    idempotency_key: key,
    as_of_utc: now,
    snapshot: getSnapshotMeta(),
    lines: accepted,
    totals,
    not_qualified: ["TVA", "frais de port", "remise", "délai"],
    notice:
      "SIMULATION : aucun devis ni aucune commande n'a été enregistré ni transmis. Reçu conservé en mémoire du processus uniquement.",
  };
  receipts.set(`${kind}:${key}`, { payloadHash, receipt });
  return { status: 200, body: receipt };
}
