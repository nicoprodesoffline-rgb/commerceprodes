import PDFDocument from "pdfkit";
import { setImmediate } from "node:timers/promises";
import { printableText, type PdfInput, type PdfPhoto } from "./model";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
class ImageFailure extends Error {
  readonly sha256: string;
  constructor(sha256: string) { super("IMAGE_SKIPPED"); this.sha256 = sha256; }
}
export interface PdfResult { bytes: Buffer; photoShas: string[]; skipped: { sha256: string; code: string }[] }

/** Une tentative bornée : les octets excédentaires sont jetés immédiatement, jamais gardés en cache. */
async function render(input: PdfInput, photos: PdfPhoto[], skipped: PdfResult["skipped"]): Promise<{ bytes: Buffer | null; photoShas: string[] }> {
  const doc = new PDFDocument({ size: "A4", margin: 48, compress: true, info: { Title: printableText(input.name) } });
  let size = 0;
  let exceeded = false;
  const chunks: Buffer[] = [];
  const photoShas: string[] = [];
  const finished = new Promise<Buffer | null>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PDF_BYTES) { exceeded = true; chunks.length = 0; }
      else if (!exceeded) chunks.push(chunk);
    });
    doc.once("end", () => { const bytes = exceeded ? null : Buffer.concat(chunks, size); chunks.length = 0; resolve(bytes); });
    doc.once("error", reject);
  });
  // L'écouteur est branché avant toute écriture ; les erreurs asynchrones restent observées.
  void finished.catch(() => undefined);
  const paragraph = (text: string) => doc.fontSize(11).fillColor("#222222").text(printableText(text), { width: 499, paragraphGap: 6 });
  const title = (text: string) => {
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.7).fontSize(14).fillColor("#333333").text(text).moveDown(0.4);
  };
  try {
    doc.font("Helvetica").fontSize(22).text(printableText(input.name)).moveDown(0.5);
    for (const block of input.layout.blocks) {
      if (exceeded) break;
      if (block === "images") {
        for (const photo of photos) {
          if (exceeded) break;
          const bytes = await photo.load();
          if (!bytes) { skipped.push({ sha256: photo.sha256, code: "MEDIA_MISSING" }); continue; }
          try {
            if (doc.y + 250 > 790) doc.addPage();
            const y = doc.y;
            doc.image(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), 48, y, { fit: [499, 230], align: "center" });
            doc.y = y + 250;
            photoShas.push(photo.sha256);
          } catch {
            // pdfkit peut avoir créé une référence non terminée : cette tentative doit être détruite.
            throw new ImageFailure(photo.sha256);
          }
          await setImmediate();
        }
      } else if (block === "description" && input.description) {
        title("Description"); paragraph(input.description);
      } else if (block === "caracteristiques" && input.characteristics.length) {
        title("Caractéristiques");
        for (const c of input.characteristics) paragraph(`${c.label} : ${c.value}`);
      } else if (block === "prix" && input.price) {
        title("Prix de vente"); paragraph(input.price);
        const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${input.priceDay}T12:00:00Z`));
        paragraph(`au ${day} - prix susceptible d'évoluer`);
      } else if (block === "coordonnees" && input.layout.contact) {
        title("Coordonnées"); paragraph(input.layout.contact);
      }
    }
    doc.end();
    return { bytes: await finished, photoShas };
  } catch (error) {
    doc.destroy();
    chunks.length = 0;
    throw error;
  }
}

/** Retire les dernières photos jusqu'au plafond, principale comprise si nécessaire. Helvetica seule, sans police embarquée. */
export async function buildFamilyPdf(input: PdfInput): Promise<PdfResult> {
  const skipped: PdfResult["skipped"] = [];
  const candidates = input.layout.blocks.includes("images") ? input.photos.slice(0, 1 + input.layout.extra_photos) : [];
  const photos = candidates.filter(photo => {
    if (photo.mime === "image/jpeg" || photo.mime === "image/png") return true;
    skipped.push({ sha256: photo.sha256, code: photo.mime === "image/webp" ? "WEBP_SKIPPED" : "FORMAT_SKIPPED" });
    return false;
  });
  for (;;) {
    let result: Awaited<ReturnType<typeof render>>;
    try { result = await render(input, photos, skipped); }
    catch (error) {
      if (!(error instanceof ImageFailure)) throw error;
      skipped.push({ sha256: error.sha256, code: "IMAGE_SKIPPED" });
      const index = photos.findIndex(p => p.sha256 === error.sha256);
      photos.splice(index, 1);
      continue;
    }
    if (result.bytes !== null) return { bytes: result.bytes, photoShas: result.photoShas, skipped };
    const removed = photos.pop();
    if (!removed) throw new Error("PDF_TEXT_TOO_LARGE"); // Les textes du catalogue sont bornés par C0.
    skipped.push({ sha256: removed.sha256, code: "SIZE_SKIPPED" });
  }
}
