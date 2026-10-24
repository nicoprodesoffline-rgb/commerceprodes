"use client";

import { useState } from "react";
import { MediaImage } from "@/components/site/media-image";

export type GalleryImage = { sha256: string; caption: string };

/**
 * Galerie Famille-first (UX-P08) : l'image principale de la FAMILLE est toujours la première, puis les médias des
 * variantes (ordre du DTO, sans doublon). Vignettes = boutons (`aria-pressed`), clavier natif.
 */
export function Gallery({ familyName, images }: { familyName: string; images: GalleryImage[] }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0]!;
  return (
    <div>
      <figure>
        <MediaImage
          sha256={current.sha256}
          alt={`${familyName} — ${current.caption}`}
          className="aspect-square w-full rounded-[14px] border border-line [image-rendering:pixelated]"
          testId="family-image"
        />
        <figcaption className="mt-2 text-sm text-ink-2" aria-live="polite">{current.caption}</figcaption>
      </figure>
      {images.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Images de la famille et des variantes">
          {images.map((img, i) => (
            <li key={img.sha256}>
              <button
                type="button"
                aria-pressed={i === index}
                aria-label={`Afficher l'image : ${img.caption}`}
                onClick={() => setIndex(i)}
                className={`block h-[64px] w-[64px] overflow-hidden rounded-[9px] border-2 ${i === index ? "border-ink" : "border-line"}`}
              >
                <MediaImage sha256={img.sha256} alt="" className="h-full w-full [image-rendering:pixelated]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
