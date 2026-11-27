/**
 * CA-3 (cercle A, Owner A.6-d1) — ce que le SITE affiche d'un texte libre : des paragraphes, et des liens vers les pages du site.
 *
 * La lecture n'est PAS écrite ici : c'est celle du contrat (`parseRichText`, c0v2/ts/src/content.ts, jumeau du Python de la Factory,
 * docs/contracts/c0_site_v2.md section 4.1, jeux d'essai V2_RICHTEXT). Ce module en tire des segments simples pour l'affichage et vérifie une dernière fois
 * qu'une adresse reste dans le site. Le site n'écrit jamais de HTML à partir du texte : le composant rend du texte (échappé par React) et des liens `next/link`.
 */
import { parseRichText } from "../../c0v2/ts/src/content";

export type RichSegment = { kind: "text"; text: string } | { kind: "link"; label: string; href: string };

// Une adresse du site : « / » puis une suite sans espace ni parenthèse, jamais « // » (une autre adresse) ni un schéma.
const SAME_SITE = /^\/(?!\/)[^\s()]*$/;

export function richTextParagraphs(text: string): RichSegment[][] {
  const read = parseRichText(text) as unknown as { paragraphs: Array<Array<{ text?: string; label?: string; path?: string }>> };
  return read.paragraphs.map((paragraph) =>
    paragraph.map((segment): RichSegment => {
      if (segment.label !== undefined && segment.path !== undefined && SAME_SITE.test(segment.path)) return { kind: "link", label: segment.label, href: segment.path };
      return { kind: "text", text: segment.text ?? `[${segment.label ?? ""}](${segment.path ?? ""})` };
    }),
  );
}
