// Sélection de fenêtre de prix et arithmétique en centimes entiers.
// Module PUR (aucun accès fixture) : importable côté client pour l'affichage,
// et utilisé par lib/site-dto/index.ts pour la revalidation serveur.
// Aucune règle PBQ, remise, marge, TVA ou port : SÉLECTION seulement.
import type { PriceResult, PriceWindow } from "./types";

// Précédence de couche quand plusieurs fenêtres couvrent (quantité, instant).
// HYPOTHÈSE BC1 documentée : PROMO prime sur BASE. À confirmer par le contrat C0.
const LAYER_PRECEDENCE = ["PROMO", "BASE"];

function layerRank(layer: string): number {
  const i = LAYER_PRECEDENCE.indexOf(layer);
  return i === -1 ? LAYER_PRECEDENCE.length : i;
}

export function isWindowActive(w: PriceWindow, instantUtc: string): boolean {
  const t = Date.parse(instantUtc);
  if (Number.isNaN(t)) throw new Error(`Instant invalide: ${instantUtc}`);
  const from = Date.parse(w.valid_from_utc);
  const until = w.valid_until_utc === null ? Infinity : Date.parse(w.valid_until_utc);
  return from <= t && t < until;
}

export function isWindowFuture(w: PriceWindow, instantUtc: string): boolean {
  return Date.parse(w.valid_from_utc) > Date.parse(instantUtc);
}

export function coversQuantity(w: PriceWindow, quantity: number): boolean {
  return quantity >= w.quantity_min && (w.quantity_max === null || quantity <= w.quantity_max);
}

export function selectWindow(
  windows: PriceWindow[],
  quantity: number,
  instantUtc: string,
): PriceResult {
  if (!Number.isInteger(quantity)) {
    return { ok: false, code: "PRICE_WINDOW_UNAVAILABLE", detail: "quantité non entière" };
  }
  const candidates = windows.filter(
    (w) => isWindowActive(w, instantUtc) && coversQuantity(w, quantity),
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      code: "PRICE_WINDOW_UNAVAILABLE",
      detail: `aucune fenêtre SELL pour quantité ${quantity} à ${instantUtc}`,
    };
  }
  const best = Math.min(...candidates.map((w) => layerRank(w.layer)));
  const top = candidates.filter((w) => layerRank(w.layer) === best);
  if (top.length !== 1) {
    return {
      ok: false,
      code: "PRICE_WINDOW_AMBIGUOUS",
      detail: `${top.length} fenêtres concurrentes de couche ${top[0]!.layer}`,
    };
  }
  const w = top[0]!;
  return {
    ok: true,
    price: {
      rate_id: w.rate_id,
      unit_amount: w.unit_amount,
      currency: w.currency,
      tax_basis_or_status: w.tax_basis_or_status,
      layer: w.layer,
      offer_price_version_public: w.offer_price_version_public,
    },
  };
}

// ---- Montants : chaînes décimales <-> centimes entiers ----

const DECIMAL_RE = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export function isDecimalAmount(s: unknown): s is string {
  return typeof s === "string" && DECIMAL_RE.test(s);
}

export function toCents(amount: string): number {
  const m = DECIMAL_RE.exec(amount);
  if (!m) throw new Error(`Montant décimal invalide: ${amount}`);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(frac);
}

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Centimes invalides: ${cents}`);
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${units}.${rest.toString().padStart(2, "0")}`;
}

export function multiplyAmount(unitAmount: string, quantity: number): string {
  const c = toCents(unitAmount) * quantity;
  if (!Number.isSafeInteger(c)) throw new Error("Dépassement de capacité");
  return centsToDecimal(c);
}

export function sumAmounts(amounts: string[]): string {
  return centsToDecimal(amounts.reduce((acc, a) => acc + toCents(a), 0));
}

// Formatage d'affichage fr-FR sans passer par un flottant (identique SSR/CSR).
export function formatAmount(amount: string, currency = "EUR"): string {
  const [int, frac = "00"] = amount.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const symbol = currency === "EUR" ? "€" : currency;
  return `${grouped},${frac.padEnd(2, "0")} ${symbol}`;
}

export function formatQuantityRange(w: PriceWindow): string {
  if (w.quantity_max === null) return `${w.quantity_min} et plus`;
  if (w.quantity_min === w.quantity_max) return `${w.quantity_min}`;
  return `${w.quantity_min} à ${w.quantity_max}`;
}

export function formatUtc(iso: string): string {
  // Affichage explicite en UTC (pas de fuseau local implicite).
  return iso.replace("T", " ").replace(/:00Z$/, " UTC").replace(/Z$/, " UTC");
}
