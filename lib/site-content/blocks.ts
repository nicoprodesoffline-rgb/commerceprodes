// CA-4 (cercle A) — ce que le SITE dessine des blocs de l'accueil. Aucune règle n'est écrite ici : `sectionLive` et `selectBlock` (c0v2/ts/src/content.ts, copie du contrat) décident,
// le SITE les appelle à CHAQUE requête avec l'instant du serveur. Rien n'est gardé de ce choix : le jour de Paris et les dates d'un bloc ne peuvent donc pas rester figés dans un cache.
import { sectionLive, selectBlock } from "../../c0v2/ts/src/content";
import type { EditorialPage, Section } from "./model";

/** Les blocs montrés à `nowUtc` : tout bloc, de tout type, hors de ses dates (début inclus, fin exclue) est écarté. */
export function liveSections(sections: readonly Section[], nowUtc: string): Section[] {
  return sections.filter(section => sectionLive(section as never, nowUtc));
}

export function livePage(page: EditorialPage, nowUtc: string): EditorialPage {
  const sections = liveSections(page.sections, nowUtc);
  return sections.length === page.sections.length ? page : { ...page, sections };
}

/** Les clés de famille d'un bloc « selection » à `nowUtc`, dans l'ordre du jour (même résultat qu'en Python). */
export function selectionFamilies(section: Extract<Section, { type: "selection" }>, nowUtc: string): string[] {
  return (selectBlock(section as never, nowUtc)["families"] as string[]) ?? [];
}
