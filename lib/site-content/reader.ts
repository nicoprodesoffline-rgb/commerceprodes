import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import type { CatalogRefs, EditorialSet } from "./model";
import { validateEnvelope } from "./validate";

const DOCUMENT = /^(\d{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;
const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_MS = 5000;
type State = { current: EditorialSet | null; highWater: number; key: string; until: number; result: EditorialSet | null; pending: Promise<unknown> };
const states = new Map<string, State>();
const report = (code: string) => console.warn(`[site-content] ${code}`); // Codes seuls : aucun chemin ni contenu utilisateur.
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

async function boundedRead(file: string, limit: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error("FILE_SIZE_OR_TYPE");
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error("FILE_SIZE_OR_TYPE");
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

async function pair(dir: string, name: string, refs: CatalogRefs): Promise<EditorialSet | null> {
  try {
    const match = DOCUMENT.exec(name);
    if (!match || name.length !== 54) return null;
    const receipt: unknown = JSON.parse((await boundedRead(path.join(dir, name.replace(/\.json$/, ".ready.json")), 16384)).toString("utf8"));
    if (!object(receipt) || receipt.contract_version !== "site_content.v1" || receipt.file !== name || typeof receipt.file !== "string" || /[/\\]|\.\./.test(receipt.file) || receipt.generation !== Number(match[1]) || receipt.publication_id !== match[2] || typeof receipt.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(receipt.sha256) || receipt.sha256.length !== 64) {
      report("RECEIPT_INVALID"); return null;
    }
    const bytes = await boundedRead(path.join(dir, name), MAX_BYTES);
    if (createHash("sha256").update(bytes).digest("hex") !== receipt.sha256) { report("SHA256_MISMATCH"); return null; }
    // UTF-8 mal formé refusé plutôt que remplacé silencieusement avant JSON.parse.
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!object(value) || value.generation !== receipt.generation || value.publication_id !== receipt.publication_id) { report("IDENTITY_MISMATCH"); return null; }
    const validation = validateEnvelope(value, refs);
    if (!validation.ok) { report(validation.code); return null; }
    return validation.set;
  } catch { report("PAIR_UNREADABLE"); return null; }
}

function retained(state: State, refs: CatalogRefs): EditorialSet | null {
  if (!state.current) return null;
  const result = validateEnvelope({ contract_version: "site_content.v1", generation: state.current.generation, publication_id: state.current.publicationId, catalogue_sequence: null, pages: state.current.pages }, refs);
  return result.ok ? state.current : null;
}

async function read(dir: string, refs: CatalogRefs, state: State): Promise<EditorialSet | null> {
  try {
    if (!(await lstat(dir)).isDirectory()) { report("DIRECTORY_UNREADABLE"); return null; }
    const names = (await readdir(dir)).filter(n => DOCUMENT.test(n) && n.length === 54).sort().reverse();
    const stamps: (string | number)[][] = [];
    const candidates: string[] = [];
    for (const name of names) {
      let complete = true;
      for (const file of [name, name.replace(/\.json$/, ".ready.json")]) {
        try {
          const s = await lstat(path.join(dir, file), { bigint: true });
          stamps.push([file, String(s.size), String(s.mtimeNs), String(s.ctimeNs), String(s.ino)]);
          if (!s.isFile()) complete = false;
        } catch { stamps.push([file, "absent"]); complete = false; }
      }
      if (complete) candidates.push(name);
    }
    const key = createHash("sha256").update(JSON.stringify([stamps, refs.catalogSha256 ?? null, [...refs.categoryKeys].sort(), [...refs.familyKeys].sort(), [...refs.mediaShas].sort()])).digest("hex");
    if (state.key === key && Date.now() < state.until) return state.result;
    let result = retained(state, refs);
    for (const name of candidates) {
      if (Number(name.slice(0, 12)) < state.highWater) { report("GENERATION_REGRESSION"); break; }
      const set = await pair(dir, name, refs);
      if (!set) continue;
      if (state.current && set.generation === state.highWater) {
        // Identité et contenu d'une génération déjà servie sont immuables pendant ce processus.
        result = retained(state, refs);
      } else {
        state.current = set;
        state.highWater = set.generation;
        result = set;
      }
      break;
    }
    state.key = key; state.until = Date.now() + CACHE_MS; state.result = result;
    return result;
  } catch { report("DIRECTORY_UNREADABLE"); return null; }
}

/** Lecture locale seule ; sérialisation par dossier, aucune régression entre requêtes concurrentes. */
export async function readEditorialSet(dir: string | undefined, refs: CatalogRefs): Promise<EditorialSet | null> {
  if (!dir || !path.isAbsolute(dir)) return null;
  const normalized = path.normalize(dir);
  let state = states.get(normalized);
  if (!state) { state = { current: null, highWater: 0, key: "", until: 0, result: null, pending: Promise.resolve() }; states.set(normalized, state); }
  const currentState = state;
  const task = currentState.pending.then(() => read(normalized, refs, currentState)).catch(() => { report("READ_FAILED"); return null; });
  currentState.pending = task;
  return task;
}

export function __resetForTests(): void { states.clear(); }
