/**
 * Source de catalogue UNIQUE du SITE (W1/A2).
 *
 * Toutes les pages et routes lisent la génération par `getCatalogSource()` ;
 * aucune autre lecture de catalogue n'existe. Deux implémentations, choisies par
 * `SITE_CATALOG_SOURCE` (aucune valeur par défaut : absence = erreur explicite) :
 *   - `fixture` : `FixtureSource` (document `site_snapshot.v1` gelé de `c0/fixtures/`) ;
 *   - `db`      : `ActiveGenerationSource` (W1/BC3, `./db-source.ts`) sur la génération ACTIVE
 *                 durable lue par l'interface BC2 `getActiveGeneration()` (`lib/site-db/generation.ts`).
 *
 * Serveur uniquement (lit le disque).
 */
import type { Json } from "@/c0/ts/src/jsonc";

export type GenerationStatus = "ACTIVE" | "UNSAFE";

/** Génération servie : le document C0 tel que publié, son statut et sa séquence. */
export type ServedGeneration = {
  /** `null` seulement si `status` vaut `UNSAFE` (BC2 ne rend jamais un document non vérifié). */
  snapshot: Json;
  status: GenerationStatus;
  catalogue_sequence: number;
};

export type ServedMedia = { bytes: Uint8Array; mime: string };

/**
 * Contrat que BC2 implémentera pour la génération ACTIVE durable.
 * `getGeneration()` renvoie `null` quand aucune génération n'est servable
 * (jamais un catalogue vide « vert »).
 */
export interface CatalogSource {
  readonly kind: "fixture" | "db";
  getGeneration(): Promise<ServedGeneration | null>;
  getMedia(sha256: string): Promise<ServedMedia | null>;
}

/** Catalogue non servable : la cause est consignée, la réponse publique reste générique. */
export class CatalogUnavailable extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "CatalogUnavailable";
  }
}

let cached: { key: string; source: CatalogSource } | null = null;

export async function getCatalogSource(): Promise<CatalogSource> {
  const kind = process.env.SITE_CATALOG_SOURCE;
  if (kind === "fixture") {
    const fixture = process.env.SITE_CATALOG_FIXTURE ?? "";
    const key = `fixture:${fixture}`;
    if (cached?.key === key) return cached.source;
    const { FixtureSource } = await import("./fixture-source");
    const source = new FixtureSource(fixture);
    cached = { key, source };
    return source;
  }
  if (kind === "db") {
    // Aucun état : la source relit la base à chaque appel (le pool est celui de BC2, singleton de processus).
    if (cached?.key === "db") return cached.source;
    const { ActiveGenerationSource } = await import("./db-source");
    const source = new ActiveGenerationSource();
    cached = { key: "db", source };
    return source;
  }
  throw new CatalogUnavailable(
    "SOURCE_NOT_CONFIGURED",
    `SITE_CATALOG_SOURCE doit valoir « fixture » ou « db » (reçu : ${kind === undefined ? "absent" : JSON.stringify(kind)})`,
  );
}
