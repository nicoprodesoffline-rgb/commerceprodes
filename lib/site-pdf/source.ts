import { price } from "@/components/site/format";
import { catalogOrNull } from "@/lib/site-catalog/page";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { mediaViews } from "@/lib/site-catalog/media-view";
import { cachedMedia } from "@/lib/site-catalog/media-cache";
import { getCatalogSource } from "@/lib/site-catalog/source";
import { getActiveContentV2 } from "@/lib/site-content/v2-source";
import { pdfLayoutFromContent, selectPhotos, type PdfInput } from "./model";

export async function resolveFamilyPdf(key: string): Promise<PdfInput | null> {
  // Aucune interprétation de chemin ni résolution par nom : comparaison exacte au catalogue servi.
  if (!key || key.length > 200) return null;
  const layout = pdfLayoutFromContent(await getActiveContentV2());
  if (!layout) return null;
  const catalog = await catalogOrNull();
  if (!catalog) throw new Error("CATALOG_UNAVAILABLE");
  const family = catalog.families.find(f => f.public_family_key === key);
  if (!family) return null;
  const instant = serverNowUtc();
  const from = familyPrice(catalog, family, instant);
  const source = await getCatalogSource();
  const selected = layout.blocks.includes("images") ? selectPhotos(family, mediaViews(catalog.c0Generation.snapshot), layout.extra_photos) : [];
  return {
    familyKey: key, name: family.name,
    description: [family.description_short, family.description_long].filter(Boolean).join("\n\n"),
    characteristics: family.characteristics ?? [],
    price: from ? `À partir de ${price(from.amount, from.basis)}${from.pack ? ` · ${from.pack}` : ""}` : null,
    priceDay: instant.slice(0, 10), layout,
    photos: selected.map(d => ({ ...d, load: async () => {
      // Le cache d'images existant peut répondre ; la génération PDF n'y ajoute aucun buffer.
      const media = cachedMedia(d.sha256) ?? await source.getMedia(d.sha256);
      return media?.mime === d.mime ? media.bytes : null;
    } })),
  };
}
