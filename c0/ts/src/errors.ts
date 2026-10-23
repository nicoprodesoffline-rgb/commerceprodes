// C0 error codes (single table, contract c0_site_v1.md §13) and verdicts. Twin of errors.py.

export const ERROR_CODES: Readonly<Record<string, readonly string[]>> = {
  SCHEMA_UNSUPPORTED: ["snapshot", "business", "events"],
  STALE_SEQUENCE: ["activation"],
  SEQUENCE_COLLISION: ["activation"],
  INTEGRITY_MISMATCH: ["snapshot", "activation", "events"],
  SIGNATURE_INVALID: ["snapshot", "activation"],
  COVERAGE_UNPROVEN: ["snapshot", "activation"],
  STAGE_HOLD: ["activation"],
  MEDIA_MISSING: ["snapshot", "activation"],
  MEDIA_HASH_MISMATCH: ["activation"],
  MEDIA_TYPE_REJECTED: ["snapshot", "activation"],
  PRICE_WINDOW_OVERLAP: ["snapshot", "business"],
  SELL_MISSING: ["snapshot"],
  CATALOG_UNSAFE: ["activation", "business"],
  INVALID_VARIANT: ["business"],
  PRICE_WINDOW_UNAVAILABLE: ["business"],
  CART_STALE: ["business"],
  PRICE_CHANGED: ["business"],
  CATALOG_CHANGED: ["business"],
  INVALID_DATA: ["business"],
  DB_WRITE_FAILED: ["business"],
  DUPLICATE_KEY_DIFFERENT_PAYLOAD: ["business"],
  UNAUTHORIZED: ["business"],
  NOT_FOUND: ["business"],
  CURSOR_INVALID: ["events"],
  EVENT_UNAUTHORIZED: ["events"],
  EVENT_DUPLICATE_NOOP: ["events"],
  EVENT_PAYLOAD_INVALID: ["events"],
  ITEM_SUPERSEDED: ["business"],
  ITEM_RETIRED: ["business"],
  PAYLOAD_MALFORMED: ["snapshot", "business", "events"],
  SNAPSHOT_INVALID: ["snapshot"],
  IDENTITY_CONFLICT: ["snapshot", "activation"],
  ITEM_NOT_PUBLISHED: ["business"],
  EVENT_TYPE_UNKNOWN: ["events"],
  EVENT_IDEMPOTENCY_CONFLICT: ["events"],
  DUPLICATE_LINE: ["business", "events"],
  MANIFEST_COUNTS_MISMATCH: ["snapshot"],
  FAMILY_WITHOUT_ITEMS: ["snapshot"],
  CATEGORY_UNKNOWN: ["snapshot"],
  KEY_FORMAT_INVALID: ["identity"],
  KEY_NAMESPACE_MISMATCH: ["identity"],
  KEY_CHECK_INVALID: ["identity"],
};

export const NOT_TESTABLE_IN_C0: readonly string[] = ["DB_WRITE_FAILED"];

export interface Verdict {
  accepted: boolean;
  outcome: string;
  error_codes: string[];
}

export function verdict(accepted: boolean, outcome: string, codes: Iterable<string> = []): Verdict {
  const unique = Array.from(new Set(codes)).sort();
  for (const code of unique) {
    if (!Object.prototype.hasOwnProperty.call(ERROR_CODES, code)) throw new Error(`undeclared error code ${code}`);
  }
  return { accepted, outcome, error_codes: unique };
}

export function rejected(codes: Iterable<string>, outcome = "REJECTED"): Verdict {
  return verdict(false, outcome, codes);
}
