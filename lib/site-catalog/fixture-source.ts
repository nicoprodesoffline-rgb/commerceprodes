/**
 * `FixtureSource` : sert UN document `site_snapshot.v1` gelé du C0 vendu
 * (`c0/fixtures/documents/<SCÉNARIO>/<fichier>.json`, choisi par `SITE_CATALOG_FIXTURE`)
 * et ses médias (`c0/fixtures/media/`, adressés par SHA-256).
 *
 * Contrôles rejoués avec les fonctions pures C0 (aucune règle locale) :
 *   - `validateSnapshotBytes` : étapes 1–5 de §8.2 (parse, octets canoniques, version, forme,
 *     règles sémantiques, intégrité `payload_sha256` / retraits / `manifest_counts`) ;
 *   - `mediaCodes` : étape 8 (§8.5 : octets présents, SHA-256, taille, signature binaire) ;
 *   - `new Generation({snapshot, status})` : entrée acceptée par `site_business.v1`.
 * NON rejoués ici (relèvent du receiver BC2) : signature, séquence vs ACTIVE, identité vs
 * génération précédente, couverture, `STAGE_HOLD`, sûreté à l'activation.
 *
 * Tout refus lève `CatalogUnavailable` : jamais de catalogue vide servi comme valide.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mediaCodes } from "@/c0/ts/src/activation";
import { Generation } from "@/c0/ts/src/business";
import { isObject, parseBytes, sha256Hex } from "@/c0/ts/src/jsonc";
import * as snap from "@/c0/ts/src/snapshot";
import { CatalogUnavailable, type CatalogSource, type ServedGeneration, type ServedMedia } from "./source";

const C0_FIXTURES = path.join(process.cwd(), "c0", "fixtures");
const FIXTURE_NAME = /^F_[A-Z0-9_]+\/[a-z0-9_]+\.json$/;

type Loaded = { generation: ServedGeneration; media: Map<string, ServedMedia> };

export class FixtureSource implements CatalogSource {
  readonly kind = "fixture" as const;
  private loaded: Loaded | null = null;

  constructor(private readonly fixture: string) {}

  private load(): Loaded {
    if (this.loaded) return this.loaded;
    if (!FIXTURE_NAME.test(this.fixture)) {
      throw new CatalogUnavailable(
        "FIXTURE_NAME_INVALID",
        `SITE_CATALOG_FIXTURE doit nommer <SCÉNARIO>/<fichier>.json sous c0/fixtures/documents (reçu : ${JSON.stringify(this.fixture)})`,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(path.join(C0_FIXTURES, "documents", this.fixture));
    } catch {
      throw new CatalogUnavailable("FIXTURE_NOT_FOUND", `Fixture introuvable : ${this.fixture}`);
    }
    const codes = snap.validateSnapshotBytes(bytes);
    if (codes.length > 0) {
      throw new CatalogUnavailable("SNAPSHOT_REFUSED", `${this.fixture} refusé par C0 : ${codes.join(", ")}`);
    }
    const doc = parseBytes(bytes, snap.MAX_BYTES);
    if (!isObject(doc) || doc["data_label"] !== "STAGING_FIXTURE") {
      throw new CatalogUnavailable("DATA_LABEL_REFUSED", `${this.fixture} : une fixture doit porter data_label STAGING_FIXTURE`);
    }
    const typed = doc as unknown as snap.Snapshot;

    // Médias : index par SHA-256 des octets réellement présents, puis contrôle C0 §8.5.
    const store = new Map<string, Uint8Array>();
    const mediaDir = path.join(C0_FIXTURES, "media");
    for (const name of readdirSync(mediaDir)) {
      const data = readFileSync(path.join(mediaDir, name));
      store.set(sha256Hex(data), data);
    }
    const mediaProblems = mediaCodes(typed, store);
    if (mediaProblems.length > 0) {
      throw new CatalogUnavailable("MEDIA_REFUSED", `${this.fixture} : médias refusés par C0 : ${mediaProblems.join(", ")}`);
    }
    const media = new Map<string, ServedMedia>();
    for (const ref of typed.media_refs) media.set(ref.sha256, { bytes: store.get(ref.sha256) as Uint8Array, mime: ref.mime });

    const generation: ServedGeneration = { snapshot: doc, status: "ACTIVE", catalogue_sequence: typed.catalogue_sequence };
    try {
      new Generation({ snapshot: doc, status: generation.status });
    } catch (error) {
      throw new CatalogUnavailable("GENERATION_REFUSED", `${this.fixture} : Generation C0 refusée (${(error as Error).message})`);
    }
    this.loaded = { generation, media };
    return this.loaded;
  }

  async getGeneration(): Promise<ServedGeneration | null> {
    return this.load().generation;
  }

  async getMedia(sha256: string): Promise<ServedMedia | null> {
    return this.load().media.get(sha256) ?? null;
  }
}
