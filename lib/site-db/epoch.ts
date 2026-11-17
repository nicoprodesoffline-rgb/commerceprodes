/**
 * Cercle 4, 4.11 et 4.12 — le « compteur d'époque » des publications reçues par CE processus. Chaque activation (catalogue, contenus) qui réussit le fait avancer ; ce que le site
 * garde en mémoire (réglages, redirections, résolution des adresses d'images) reste valable tant que l'époque n'a pas changé.
 *
 * Il vit sur `globalThis`, sous un symbole : le proxy et les routes sont empaquetés séparément, une variable de module existerait en deux exemplaires et l'activation ne ferait pas
 * avancer celle que le proxy lit. Il n'y a qu'UN processus de site sur le tampon ; le plafond `SITE_MEMORY_MAX_AGE_SECONDS` (30 s) ne sert que si un second processus apparaissait (il verrait alors
 * une publication au plus 30 s plus tard).
 */
const KEY = Symbol.for("prodes.site.publication-epoch");
type Holder = typeof globalThis & { [KEY]?: { epoch: number } };

function holder(): { epoch: number } {
  const g = globalThis as Holder;
  return (g[KEY] ??= { epoch: 0 });
}

/** Plafond de garde en mémoire : SITE_MEMORY_MAX_AGE_SECONDS (30 par défaut ; 0 = toujours revérifier en base, pour les essais qui modifient la base sans passer par les routes signées). */
export function memoryMaxAgeMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env["SITE_MEMORY_MAX_AGE_SECONDS"];
  return raw !== undefined && /^[0-9]{1,5}$/.test(raw.trim()) ? Number(raw.trim()) * 1000 : 30_000;
}

export function currentEpoch(): number {
  return holder().epoch;
}

export function advanceEpoch(): void {
  holder().epoch += 1;
}

/** Une valeur gardée en mémoire est-elle encore valable ? Même époque, et pas plus vieille que le plafond (horloge reculée = périmée). */
export function stillValid(entry: { epoch: number; at: number }, now: number = Date.now()): boolean {
  const age = now - entry.at;
  return entry.epoch === currentEpoch() && age >= 0 && age < memoryMaxAgeMs();
}
