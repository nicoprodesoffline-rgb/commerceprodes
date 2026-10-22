// Public identity keys (contract c0_public_identity_v1.md). Twin of identity.py.
// public_item_key = "PI-" + 8 Crockford base32 symbols + 1 check symbol (weighted sum over GF(2^5)).

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAYLOAD_LENGTH = 8;
export const MAX_SEQUENCE = 32 ** PAYLOAD_LENGTH - 1;
export type Namespace = "item" | "family";
export const NAMESPACES: Readonly<Record<Namespace, readonly [string, number]>> = { item: ["PI", 1], family: ["PF", 2] };
const KEY_PATTERNS: Readonly<Record<Namespace, RegExp>> = {
  item: /^PI-[0-9A-HJKMNP-TV-Z]{9}$/,
  family: /^PF-[0-9A-HJKMNP-TV-Z]{9}$/,
};

const POLYNOMIAL = 0b100101; // x^5 + x^2 + 1

/** Product in GF(2^5) modulo x^5 + x^2 + 1. */
export function gf32Mul(left: number, right: number): number {
  let a = left;
  let b = right;
  let result = 0;
  while (b !== 0) {
    if ((b & 1) !== 0) result ^= a;
    b >>= 1;
    a <<= 1;
    if ((a & 0b100000) !== 0) a ^= POLYNOMIAL;
  }
  return result;
}

/** C such that sum(alpha^(i+1) * v_i) + 1 * C = 0 in GF(32) (addition = XOR), alpha = 2. */
export function checkSymbol(namespace: Namespace, payload: string): string {
  const values = [NAMESPACES[namespace][1], ...Array.from(payload, (char) => ALPHABET.indexOf(char))];
  let total = 0;
  let weight = 1;
  for (const value of values) {
    weight = gf32Mul(weight, 2);
    total ^= gf32Mul(weight, value);
  }
  return ALPHABET[total] as string;
}

export function encodeSequence(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) throw new RangeError("sequence out of range");
  let rest = sequence;
  const symbols: string[] = [];
  for (let i = 0; i < PAYLOAD_LENGTH; i += 1) {
    symbols.push(ALPHABET[rest % 32] as string);
    rest = Math.floor(rest / 32);
  }
  return symbols.reverse().join("");
}

export function makeKey(namespace: Namespace, sequence: number): string {
  const payload = encodeSequence(sequence);
  return `${NAMESPACES[namespace][0]}-${payload}${checkSymbol(namespace, payload)}`;
}

/** null if value is a valid key of namespace, else the identity error code. */
export function keyProblem(value: unknown, namespace: Namespace): string | null {
  if (typeof value !== "string") return "KEY_FORMAT_INVALID";
  if (!KEY_PATTERNS[namespace].test(value)) {
    const others = (Object.keys(KEY_PATTERNS) as Namespace[]).filter((name) => name !== namespace && KEY_PATTERNS[name].test(value));
    return others.length > 0 ? "KEY_NAMESPACE_MISMATCH" : "KEY_FORMAT_INVALID";
  }
  const payload = value.slice(3, 11);
  if (payload === "0".repeat(PAYLOAD_LENGTH)) return "KEY_FORMAT_INVALID";
  if (checkSymbol(namespace, payload) !== value[11]) return "KEY_CHECK_INVALID";
  return null;
}

export function isKey(value: unknown, namespace: Namespace): value is string {
  return keyProblem(value, namespace) === null;
}

export function decodeSequence(value: string, namespace: Namespace): number {
  if (keyProblem(value, namespace) !== null) throw new RangeError("not a valid key");
  let sequence = 0;
  for (const char of value.slice(3, 11)) sequence = sequence * 32 + ALPHABET.indexOf(char);
  return sequence;
}
