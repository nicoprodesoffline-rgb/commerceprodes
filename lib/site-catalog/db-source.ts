/**
 * `ActiveGenerationSource` (W1/BC3) : sert la génération ACTIVE durable de la base SITE, lue par l'interface
 * BC2 `getActiveGeneration()` (`lib/site-db/generation.ts`, contrat docs/SITE_DB_SCHEMA.md), et ses médias
 * depuis `site_media`.
 *
 * - Aucune mémoire de processus comme VÉRITÉ : chaque appel interroge la base (sonde du pointeur et de la ligne de
 *   génération, W6-P). Le document n'est relu et reverifié que si la sonde change (voir `lib/site-db/generation.ts`) ;
 *   la validation C0 (`new Generation`) et l'index des médias sont mémorisés PAR OBJET document vérifié (WeakMap) :
 *   un document nouvellement lu est un nouvel objet, donc revalidé.
 * - `status: "UNSAFE"` (fail-closed BC2, `snapshot` nul) est remonté tel quel : `loadCatalog` refuse de servir.
 * - La génération ACTIVE est ensuite passée à `new Generation(...)` (C0) : un document que C0 ne sait pas
 *   construire n'est jamais servi (`GENERATION_REFUSED`).
 * - Médias : seul un SHA déclaré par `media_refs` de la génération ACTIVE est servi ; les octets lus sont
 *   REVÉRIFIÉS (SHA-256 et taille = déclaration) avant d'être servis (docs/SITE_DB_SCHEMA.md, dette F-06 de
 *   BC2 : `UNSAFE` ne couvre pas les médias). Le `mime` servi est celui déclaré par `media_refs` (C0 §8.5),
 *   jamais celui de `site_media.mime` (indicatif).
 *
 * Serveur uniquement. Configuration de base invalide → `CatalogUnavailable("SITE_DB_CONFIG_INVALID")` ;
 * base injoignable → `CatalogUnavailable("SITE_DB_UNREACHABLE")` (jamais un catalogue vide « vert »).
 */
import { createHash } from "node:crypto";
import { Generation } from "@/c0/ts/src/business";
import type { Json } from "@/c0/ts/src/jsonc";
import type { Snapshot } from "@/c0/ts/src/snapshot";
import { getActiveGeneration, type ActiveGeneration } from "@/lib/site-db/generation";
import { SiteDbConfigError, getPool } from "@/lib/site-db/pool";
import { CatalogUnavailable, type CatalogSource, type ServedGeneration, type ServedMedia } from "./source";

const SHA_RE = /^[0-9a-f]{64}$/;

/** Documents déjà acceptés par `new Generation` de C0 (clé = l'objet vérifié par BC2, jamais une valeur comparée). */
const c0Accepted = new WeakSet<object>();
/** Index SHA -> déclaration de média, par objet document vérifié. */
const mediaIndex = new WeakMap<object, Map<string, Snapshot["media_refs"][number]>>();

function dbError(error: unknown): never {
  if (error instanceof SiteDbConfigError) throw new CatalogUnavailable("SITE_DB_CONFIG_INVALID", error.message);
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "ERROR";
  // Jamais le message brut (il peut citer l'URL de connexion) : seulement la classe d'erreur.
  throw new CatalogUnavailable("SITE_DB_UNREACHABLE", `base SITE injoignable ou requête refusée (code=${code})`);
}

export class ActiveGenerationSource implements CatalogSource {
  readonly kind = "db" as const;

  private async active(): Promise<ActiveGeneration | null> {
    try {
      return await getActiveGeneration(getPool());
    } catch (error) {
      if (error instanceof CatalogUnavailable) throw error;
      return dbError(error);
    }
  }

  async getGeneration(): Promise<ServedGeneration | null> {
    const active = await this.active();
    if (active === null) return null;
    if (active.status === "UNSAFE" || active.snapshot === null) {
      return { snapshot: null, status: "UNSAFE", catalogue_sequence: active.catalogue_sequence };
    }
    const snapshot = active.snapshot as unknown as Json;
    if (!c0Accepted.has(active.snapshot)) {
      try {
        new Generation({ snapshot, status: "ACTIVE" });
      } catch (error) {
        throw new CatalogUnavailable("GENERATION_REFUSED", `génération ACTIVE ${active.catalogue_sequence} refusée par C0 (${(error as Error).message})`);
      }
      c0Accepted.add(active.snapshot);
    }
    return { snapshot, status: "ACTIVE", catalogue_sequence: active.catalogue_sequence };
  }

  async getMedia(sha256: string): Promise<ServedMedia | null> {
    if (!SHA_RE.test(sha256)) return null;
    const active = await this.active();
    if (active === null) throw new CatalogUnavailable("NO_ACTIVE_GENERATION", "Aucune génération ACTIVE servable");
    if (active.status === "UNSAFE" || active.snapshot === null) throw new CatalogUnavailable("CATALOG_UNSAFE", "génération ACTIVE non sûre (BC2)");
    let index = mediaIndex.get(active.snapshot);
    if (index === undefined) {
      index = new Map();
      for (const m of active.snapshot.media_refs) if (!index.has(m.sha256)) index.set(m.sha256, m);
      mediaIndex.set(active.snapshot, index);
    }
    const ref = index.get(sha256);
    if (ref === undefined) return null;
    let row: { bytes: Buffer } | undefined;
    try {
      ({ rows: [row] } = await getPool().query<{ bytes: Buffer }>("SELECT bytes FROM site_media WHERE sha256 = $1", [sha256]));
    } catch (error) {
      return dbError(error);
    }
    if (row === undefined) {
      console.error(`[site-catalog] média déclaré absent de site_media sha256=${sha256}`);
      return null;
    }
    const bytes = new Uint8Array(row.bytes);
    if (bytes.length !== ref.size || createHash("sha256").update(bytes).digest("hex") !== sha256) {
      console.error(`[site-catalog] média altéré refusé (SHA-256 ou taille ≠ media_refs) sha256=${sha256}`);
      return null;
    }
    return { bytes, mime: ref.mime };
  }
}
