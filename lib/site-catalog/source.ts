/**
 * Source de catalogue UNIQUE du SITE (W1/A2).
 *
 * Toutes les pages et routes lisent la génération par `getCatalogSource()` ;
 * aucune autre lecture de catalogue n'existe. Deux implémentations, choisies par
 * `SITE_CATALOG_SOURCE` (aucune valeur par défaut : absence = erreur explicite) :
 *   - `fixture` : `FixtureSource` (document `site_snapshot.v1` gelé de `c0/fixtures/`) ;
 *   - `db`      : `ActiveGenerationSource` fournie par BC2 (`lib/site-db/generation.ts`),
 *                 non livrée ici — sélectionner `db` échoue explicitement tant que BC2
 *                 ne l'a pas branchée.
 *
 * Serveur uniquement (lit le disque).
 */
import type { Json } from "@/c0/ts/src/jsonc";

export type GenerationStatus = "ACTIVE" | "UNSAFE";

/** Génération servie : le document C0 tel que publié, son statut et sa séquence. */
export type ServedGeneration = {
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
    // BC2 fournira `ActiveGenerationSource` (lib/site-db/generation.ts) et la branchera ici.
    throw new CatalogUnavailable(
      "DB_SOURCE_NOT_PROVIDED",
      "SITE_CATALOG_SOURCE=db : ActiveGenerationSource (BC2, lib/site-db/generation.ts) n'est pas encore fournie",
    );
  }
  throw new CatalogUnavailable(
    "SOURCE_NOT_CONFIGURED",
    `SITE_CATALOG_SOURCE doit valoir « fixture » ou « db » (reçu : ${kind === undefined ? "absent" : JSON.stringify(kind)})`,
  );
}
