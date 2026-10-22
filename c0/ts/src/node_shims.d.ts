// Minimal ambient declarations of the Node 22 built-ins this package uses.
// They replace @types/node on purpose: the only npm dependency allowed is `typescript` (BC0 D12).

declare module "node:crypto" {
  interface Digestible {
    update(data: Uint8Array): Digestible;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Digestible;
  export function createHmac(algorithm: "sha256", key: Uint8Array): Digestible;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module "node:fs" {
  interface DirEntry {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function mkdirSync(path: string, options: { recursive: boolean }): void;
  export function readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): Promise<void>;
}

declare module "node:assert/strict" {
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function ok(value: unknown, message?: string): void;
  export function throws(fn: () => unknown, message?: string): void;
}

declare const __dirname: string;

declare class TextEncoder {
  encode(input: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input: Uint8Array): string;
}
