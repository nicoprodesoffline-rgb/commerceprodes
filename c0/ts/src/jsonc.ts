// C0 strict JSON reading, canonical bytes and domain-separated digests.
// Twin of c0/python/c0_contracts/jsonc.py: the same documents are accepted and the same
// canonical bytes are produced (Factory canonical JSON V1, contract c0_site_v1.md §4).

import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export const MAX_SAFE_INTEGER = 9007199254740991;
export const MAX_DEPTH = 64;

export class MalformedPayload extends Error {}

const ENCODER = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return ENCODER.encode(text);
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newObject(): JsonObject {
  return Object.create(null) as JsonObject;
}

// --- strict parser ---------------------------------------------------------------------------

class Parser {
  private index = 0;
  constructor(private readonly text: string) {}

  parseDocument(): Json {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.text.length) throw new MalformedPayload("extra data");
    return value;
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length) {
      const c = this.text.charCodeAt(this.index);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.index += 1;
      else break;
    }
  }

  private parseValue(depth: number): Json {
    const c = this.text[this.index];
    if (c === "{") return this.parseObject(depth + 1);
    if (c === "[") return this.parseArray(depth + 1);
    if (c === '"') return this.parseString();
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return this.parseNumber();
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (this.text.startsWith(literal, this.index)) {
        this.index += literal.length;
        return value;
      }
    }
    throw new MalformedPayload("unexpected character");
  }

  private parseObject(depth: number): JsonObject {
    if (depth > MAX_DEPTH) throw new MalformedPayload("nesting too deep");
    this.index += 1;
    const result = newObject();
    this.skipWhitespace();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') throw new MalformedPayload("key expected");
      const key = this.parseString();
      if (Object.prototype.hasOwnProperty.call(result, key)) throw new MalformedPayload("duplicate key");
      this.skipWhitespace();
      if (this.text[this.index] !== ":") throw new MalformedPayload("colon expected");
      this.index += 1;
      this.skipWhitespace();
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      const c = this.text[this.index];
      this.index += 1;
      if (c === "}") return result;
      if (c !== ",") throw new MalformedPayload("comma expected");
    }
  }

  private parseArray(depth: number): Json[] {
    if (depth > MAX_DEPTH) throw new MalformedPayload("nesting too deep");
    this.index += 1;
    const result: Json[] = [];
    this.skipWhitespace();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      const c = this.text[this.index];
      this.index += 1;
      if (c === "]") return result;
      if (c !== ",") throw new MalformedPayload("comma expected");
    }
  }

  private parseString(): string {
    this.index += 1;
    let out = "";
    for (;;) {
      if (this.index >= this.text.length) throw new MalformedPayload("unterminated string");
      const c = this.text.charCodeAt(this.index);
      if (c === 0x22) {
        this.index += 1;
        break;
      }
      if (c < 0x20) throw new MalformedPayload("control character in string");
      if (c !== 0x5c) {
        out += this.text[this.index];
        this.index += 1;
        continue;
      }
      const e = this.text[this.index + 1];
      this.index += 2;
      switch (e) {
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "t": out += "\t"; break;
        case "u": {
          const hex = this.text.slice(this.index, this.index + 4);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) throw new MalformedPayload("bad unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          this.index += 4;
          break;
        }
        default:
          throw new MalformedPayload("bad escape");
      }
    }
    if (hasLoneSurrogate(out)) throw new MalformedPayload("lone surrogate");
    return out;
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9][0-9]*)/.exec(this.text.slice(this.index));
    if (match === null) throw new MalformedPayload("bad number");
    const token = match[0];
    this.index += token.length;
    const next = this.text[this.index];
    if (next === "." || next === "e" || next === "E") throw new MalformedPayload("non-integer number");
    const digits = token.startsWith("-") ? token.slice(1) : token;
    if (digits.length > 16) throw new MalformedPayload("integer out of the safe range");
    const big = BigInt(token);
    if (big > BigInt(MAX_SAFE_INTEGER) || big < -BigInt(MAX_SAFE_INTEGER)) throw new MalformedPayload("integer out of the safe range");
    const value = Number(big);
    return value === 0 ? 0 : value;
  }
}

function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        i += 1;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** NFC-normalized copy; duplicate keys after NFC are refused (canonical JSON V1). */
function normalize(value: Json): Json {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(normalize);
  if (isObject(value)) {
    const result = newObject();
    for (const key of Object.keys(value)) {
      const normalized = key.normalize("NFC");
      if (Object.prototype.hasOwnProperty.call(result, normalized)) throw new MalformedPayload("duplicate key after NFC normalization");
      result[normalized] = normalize(value[key] as Json);
    }
    return result;
  }
  return value;
}

export function parseBytes(data: Uint8Array, maxBytes: number): Json {
  if (data.length > maxBytes) throw new MalformedPayload("document too large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    throw new MalformedPayload("not strict UTF-8");
  }
  return normalize(new Parser(text).parseDocument());
}

// --- canonical bytes --------------------------------------------------------------------------

export class CanonicalizationError extends Error {}

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = (left[i] as string).codePointAt(0) as number;
    const y = (right[i] as string).codePointAt(0) as number;
    if (x !== y) return x - y;
  }
  return left.length - right.length;
}

function escapeString(text: string): string {
  if (hasLoneSurrogate(text)) throw new CanonicalizationError("lone surrogate");
  let out = '"';
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0d) out += "\\r";
    else if (c === 0x09) out += "\\t";
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += text[i];
  }
  return out + '"';
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new CanonicalizationError("only safe integers are canonical");
    return String(value === 0 ? 0 : value);
  }
  if (typeof value === "string") return escapeString(value.normalize("NFC"));
  if (Array.isArray(value)) return "[" + value.map(serialize).join(",") + "]";
  if (typeof value === "object") {
    const entries = new Map<string, unknown>();
    for (const key of Object.keys(value as object)) {
      const normalized = key.normalize("NFC");
      if (entries.has(normalized)) throw new CanonicalizationError("duplicate key after NFC normalization");
      entries.set(normalized, (value as Record<string, unknown>)[key]);
    }
    const keys = Array.from(entries.keys()).sort(compareCodePoints);
    return "{" + keys.map((key) => escapeString(key) + ":" + serialize(entries.get(key))).join(",") + "}";
  }
  throw new CanonicalizationError(`unsupported type ${typeof value}`);
}

export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(serialize(value));
}

/** C0 §4: transported bytes must equal their own canonical form recomputed by the receiver. */
export function isCanonical(data: Uint8Array, value: Json): boolean {
  const canonical = canonicalBytes(value);
  return canonical.length === data.length && canonical.every((byte, index) => byte === data[index]);
}

/** C0 §10/§11: at most one line per (public_item_key, variant_axes) (review R-01). */
export function hasDuplicateLines(lines: JsonObject[]): boolean {
  const seen = new Set<string>();
  for (const line of lines) {
    const identity = String(line["public_item_key"]) + "\u0000" + serialize(line["variant_axes"]);
    if (seen.has(identity)) return true;
    seen.add(identity);
  }
  return false;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256(<domain> 0x00 <canonical bytes>) as 64 lowercase hex characters (contract §5). */
export function digest(domain: string, value: unknown): string {
  return sha256Hex(concat(utf8(domain), new Uint8Array([0]), canonicalBytes(value)));
}
