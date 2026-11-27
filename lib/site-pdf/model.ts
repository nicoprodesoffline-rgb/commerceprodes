import { createHash } from "node:crypto";
import type { Derivative, MediaView } from "../site-catalog/media-view";

export type PdfBlock = "images" | "description" | "caracteristiques" | "prix" | "coordonnees";
export interface PdfLayout {
  blocks: PdfBlock[];
  font: "Helvetica";
  extra_photos: number;
  retention_days: number;
  contact: string | null;
}
export interface PdfPhoto {
  sha256: string;
  mime: string;
  size: number;
  load(): Promise<Uint8Array | null>;
}
export interface PdfInput {
  familyKey: string;
  name: string;
  description: string;
  characteristics: { label: string; value: string }[];
  price: string | null;
  priceDay: string;
  layout: PdfLayout;
  photos: PdfPhoto[];
}

/** Le document actif a déjà passé la validation C0 v2. Aucun réglage de secours n'allume la fonction. */
export function pdfLayoutFromContent(doc: Record<string, unknown> | null): PdfLayout | null {
  return (doc?.pdf_layout as PdfLayout | null | undefined) ?? null;
}

// WinAnsi / Helvetica standard : NFC pour les accents décomposés, remplacement des glyphes absents.
const EXTRA_WINANSI = new Set(Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"));
export function printableText(value: string): string {
  return Array.from(value.normalize("NFC"), (c) => {
    const n = c.codePointAt(0)!;
    if (c === "\n") return c;
    if (c === "\t" || c === "\u202f" || c === "\u00a0") return " ";
    return (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || EXTRA_WINANSI.has(c) ? c : "?";
  }).join("");
}

export function filename(name: string): string {
  const safe = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/g, "");
  return `${safe || "fiche-produit"}.pdf`;
}

/** Principale puis photos de variantes, sans doublon. Aucun repli vers l'original. */
export function selectPhotos(family: { image_main_sha256: string; items: readonly { public_media_refs: string[] }[] }, views: Map<string, Pick<MediaView, "derivatives">>, extra: number): Derivative[] {
  const identities = [...new Set([family.image_main_sha256, ...family.items.flatMap(i => i.public_media_refs)])].slice(0, 1 + extra);
  const selected: Derivative[] = [];
  for (const identity of identities) {
    const derivatives = views.get(identity)?.derivatives ?? [];
    const supported = derivatives.filter(d => d.mime === "image/jpeg" || d.mime === "image/png");
    const candidates = [...(supported.length ? supported : derivatives)].sort((a, b) => a.width - b.width);
    const picked = candidates.find(d => d.width >= 1200) ?? candidates.at(-1);
    if (picked && !selected.some(d => d.sha256 === picked.sha256)) selected.push(picked);
  }
  return selected;
}

export function fingerprint(input: PdfInput, photoShas: readonly string[]): string {
  const has = (block: PdfBlock) => input.layout.blocks.includes(block);
  const printed = {
    family: input.familyKey, layout: input.layout, name: printableText(input.name),
    description: has("description") ? printableText(input.description) : null,
    characteristics: has("caracteristiques") ? input.characteristics.map(c => [printableText(c.label), printableText(c.value)]) : [],
    photos: has("images") ? photoShas : [],
    price: has("prix") && input.price ? printableText(input.price) : null,
    day: has("prix") && input.price ? input.priceDay : null,
  };
  return createHash("sha256").update(JSON.stringify(printed)).digest("hex");
}


/** Métadonnée de recherche : les photos non imprimées ne font jamais partie de la clé de la fiche. */
export function sourceFingerprint(input: PdfInput, truncated: boolean): string {
  return createHash("sha256").update(JSON.stringify([fingerprint(input, []), truncated ? null : compatiblePhotoShas(input).length])).digest("hex");
}

function compatiblePhotoShas(input: PdfInput): string[] {
  return input.layout.blocks.includes("images")
    ? input.photos.slice(0, 1 + input.layout.extra_photos).filter(p => p.mime === "image/jpeg" || p.mime === "image/png").map(p => p.sha256)
    : [];
}

export interface RetainedMetadata { fingerprint: string; source_fingerprint: string; photo_shas: string[] }

/** Une fiche tronquée garde son préfixe de photos ; changer une photo écartée ne renouvelle pas sa conservation. */
export function matchesRetained(input: PdfInput, row: RetainedMetadata): boolean {
  const current = compatiblePhotoShas(input);
  return row.fingerprint === fingerprint(input, row.photo_shas)
    && row.photo_shas.length <= current.length
    && row.photo_shas.every((sha, i) => sha === current[i])
    && (row.source_fingerprint === sourceFingerprint(input, true)
      || (row.photo_shas.length === current.length && row.source_fingerprint === sourceFingerprint(input, false)));
}
