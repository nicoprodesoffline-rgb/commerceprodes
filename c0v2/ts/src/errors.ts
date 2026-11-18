// Error codes of the v2 contracts: the frozen v1 table plus the two codes of site_content.v2 (c0_site_v2.md §4.2).
// Twin of c0v2/python/c0_contracts_v2/errors.py.

import { ERROR_CODES as V1_ERROR_CODES, Verdict } from "../../../c0/ts/src/errors";

export type { Verdict };

export const ERROR_CODES: Readonly<Record<string, readonly string[]>> = {
  ...V1_ERROR_CODES,
  CONTENT_INVALID: ["content"],
  REFERENCE_MISSING: ["content"],
  PREVIEW_EXPIRED: ["content"],
};

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
