/** CA-9 : jours de Paris et validation du contrat product_metrics_daily.v2, sans état visiteur. */
import { parseBytes } from "../../c0/ts/src/jsonc";
export const METRICS = ["views", "add_to_cart", "quote_start", "quote_submit"] as const;
export type Metric = (typeof METRICS)[number];
export type BrowserMetric = Exclude<Metric, "quote_submit">;
export type MetricRow = { date: string; public_item_key: string } & Record<Metric, number>;
export type Batch = { contract_version: "product_metrics_daily.v2"; up_to: string; rows: MetricRow[] };
export const MAX_ROWS = 5000;
export const MAX_BYTES = 1_048_576;
const paris = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export function parisDay(instant: Date): string {
  const parts = paris.formatToParts(instant);
  const part = (type: string): string => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "0001-01-01"
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function previousDay(day: string): string {
  return new Date(Date.parse(day + "T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
export function parseEvent(bytes: Uint8Array, keys: ReadonlySet<string>): { key: string; event: BrowserMetric } | null {
  if (bytes.byteLength > 1024) return null;
  let v: unknown;
  try { v = parseBytes(bytes, 1024); } catch { return null; }
  if (!object(v) || !exact(v, ["key", "event"]) || typeof v.key !== "string" || !keys.has(v.key)
    || (v.event !== "views" && v.event !== "add_to_cart" && v.event !== "quote_start")) return null;
  return { key: v.key, event: v.event };
}
/** Budgets fixes par minute : 6000/processus et 120/produit. Au plus 6000 clés en mémoire, aucune adresse. */
export function createLimiter(globalLimit = 6000, productLimit = 120): (key: string, nowMs: number) => boolean {
  let minute = -1; let total = 0;
  const products = new Map<string, number>();
  return (key, nowMs) => {
    const current = Math.floor(nowMs / 60_000);
    if (current !== minute) { minute = current; total = 0; products.clear(); }
    const count = products.get(key) ?? 0;
    if (total >= globalLimit || count >= productLimit) return false;
    total++; products.set(key, count + 1); return true;
  };
}
/** Codes de validation du contrat ; les conflits entre lots appartiennent au registre Factory. */
export function validateBatch(value: unknown, options: { now: Date; depuis?: string | null; keys: ReadonlySet<string> }): string[] {
  const problems: string[] = [];
  const add = (code: string): void => { if (!problems.includes(code)) problems.push(code); };
  if (!object(value)) return ["METRICS_NOT_AN_OBJECT"];
  const envelope = ["contract_version", "up_to", "rows"];
  if (envelope.some((k) => !Object.hasOwn(value, k))) add("KEY_MISSING");
  if (Object.keys(value).some((k) => !envelope.includes(k))) add("KEY_UNKNOWN");
  if (value.contract_version !== "product_metrics_daily.v2") add("CONTRACT_VERSION_UNSUPPORTED");
  if (!validDay(value.up_to) || (options.depuis != null && !validDay(options.depuis))) add("DATE_INVALID");
  if (validDay(value.up_to) && value.up_to >= parisDay(options.now)) add("DAY_NOT_CLOSED");
  if (!Array.isArray(value.rows)) return [...problems, "ROWS_INVALID"];
  if (value.rows.length > MAX_ROWS) add("ROWS_TOO_MANY");
  const seen = new Set<string>(); let previous = "";
  for (const row of value.rows) {
    if (!object(row)) { add("ROW_INVALID"); continue; }
    if (["date", "public_item_key"].some((k) => !Object.hasOwn(row, k))) add("KEY_MISSING");
    if (Object.keys(row).some((k) => !["date", "public_item_key", ...METRICS].includes(k))) add("KEY_UNKNOWN");
    if (!validDay(row.date)) add("DATE_INVALID");
    else if ((validDay(value.up_to) && row.date > value.up_to) || (options.depuis != null && row.date < options.depuis)) add("DATE_OUT_OF_RANGE");
    if (typeof row.public_item_key !== "string" || !options.keys.has(row.public_item_key)) add("ITEM_UNKNOWN");
    for (const metric of METRICS) {
      if (!Object.hasOwn(row, metric)) add("METRIC_MISSING");
      else if (!Number.isSafeInteger(row[metric]) || (row[metric] as number) < 0) add("METRIC_INVALID");
    }
    if (typeof row.date === "string" && typeof row.public_item_key === "string") {
      const identity = row.date + "\u0000" + row.public_item_key;
      if (seen.has(identity)) add("ROW_DUPLICATE");
      else if (identity < previous) add("ROWS_UNSORTED");
      seen.add(identity); previous = identity;
    }
  }
  return problems;
}

/** Conserve la distinction lexicale JSON entre 1 et 1.0, perdue par JSON.parse. */
export function validateBatchBytes(bytes: Uint8Array, options: Parameters<typeof validateBatch>[1]): string[] {
  try { return validateBatch(parseBytes(bytes, MAX_BYTES), options); }
  catch (error) {
    if (error instanceof Error && /non-integer number|integer out of the safe range/.test(error.message)) return ["METRIC_INVALID"];
    return ["METRICS_NOT_AN_OBJECT"];
  }
}
