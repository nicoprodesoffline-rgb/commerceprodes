// Scalar formats shared by every C0 contract (contract §6). Twin of formats.py.
// Every regex is anchored ^(?:...)$ to behave like Python's fullmatch.

import { Json, JsonObject, MAX_SAFE_INTEGER, isObject } from "./jsonc";

export const HEX64 = /^(?:[0-9a-f]{64})$/;
export const TOKEN = /^(?:[A-Za-z0-9][A-Za-z0-9._:-]{0,63})$/;
export const IDEMPOTENCY_KEY = /^(?:[A-Za-z0-9][A-Za-z0-9._:-]{7,127})$/;
const UTC = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/;
const MONEY = /^(0|[1-9][0-9]{0,8})\.([0-9]{2})$/;
export const SLUG = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const CATEGORY_KEY = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const AXIS_KEY = /^(?:[a-z][a-z0-9_]{0,31})$/;
export const EMAIL = /^(?:[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24})$/;
export const PHONE = /^(?:\+?[0-9][0-9 .-]{5,19})$/;
const BLANK = /^[\t\n\x0b\x0c\r ]*$/;
const FORBIDDEN_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isCount(value: unknown, minimum = 0, maximum = MAX_SAFE_INTEGER): value is number {
  return isInt(value) && value >= minimum && value <= maximum;
}

export function matches(pattern: RegExp, value: unknown): value is string {
  return typeof value === "string" && pattern.test(value);
}

export function isHex64(value: unknown): value is string {
  return matches(HEX64, value);
}

export function isToken(value: unknown): value is string {
  return matches(TOKEN, value);
}

export function isUtc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const found = UTC.exec(value);
  if (found === null) return false;
  const [year, month, day, hour, minute, second] = found.slice(1).map(Number) as [number, number, number, number, number, number];
  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 && leap ? 29 : (DAYS[month - 1] as number);
  return day >= 1 && day <= days;
}

/** Cents of a C0 money string as a BigInt ("38.50" -> 3850n), or null if the format is wrong. */
export function moneyCents(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const found = MONEY.exec(value);
  if (found === null) return null;
  return BigInt(found[1] as string) * 100n + BigInt(found[2] as string);
}

export function centsToMoney(cents: bigint): string {
  const whole = cents / 100n;
  const rest = cents % 100n;
  return `${whole.toString()}.${rest.toString().padStart(2, "0")}`;
}

export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

export function isText(value: unknown, maximum: number, multiline = false): value is string {
  if (typeof value !== "string" || BLANK.test(value)) return false;
  if (codePointLength(value) > maximum || FORBIDDEN_CONTROL.test(value)) return false;
  if (!multiline && (value.includes("\t") || value.includes("\n") || value.includes("\r"))) return false;
  return true;
}

export function exactKeys(value: unknown, required: readonly string[]): value is JsonObject {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== new Set(required).size) return false;
  return keys.every((key) => required.includes(key));
}

export function get(value: JsonObject, key: string): Json {
  return value[key] as Json;
}
