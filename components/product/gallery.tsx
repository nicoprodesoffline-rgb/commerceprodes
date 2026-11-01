"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { MediaImage } from "@/components/site/media-image";
import { useShowImages } from "@/components/site/media-policy";

export type GalleryImage = { sha256: string; caption: string };

/** Médias du produit uniquement, dans leur ordre d'origine ; les visuels non montrables ne créent pas de vignettes. */
export function Gallery({ familyName, images }: { familyName: string; images: GalleryImage[] }) {
  const allowed = useShowImages();
  const [index, setIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = allowed ? images.filter((img) => Boolean(img.sha256)) : [];
  const active = index < visible.length ? index : 0;
  const current = visible[active];

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (visible.length < 2) return;
    let next: number;
    if (event.key === "ArrowRight") next = (active + 1) % visible.length;
    else if (event.key === "ArrowLeft") next = (active + visible.length - 1) % visible.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else return;
    event.preventDefault();
    setIndex(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="min-w-0" onKeyDown={navigate} role="group" aria-label={`Photos de ${familyName}`}>
      <figure tabIndex={visible.length > 1 ? 0 : undefined} className="focus-visible:outline-offset-4">
        <MediaImage
          sha256={current?.sha256 ?? null}
          alt={familyName}
          className="aspect-square w-full bg-white object-contain"
          testId="family-image"
        />
        {visible.length > 1 && <figcaption className="sr-only" aria-live="polite">Photo {active + 1} sur {visible.length} : {current?.caption}</figcaption>}
      </figure>
      {visible.length > 1 && (
        <ul className="mt-4 flex flex-wrap gap-3" aria-label="Photos du produit">
          {visible.map((img, i) => (
            <li key={img.sha256}>
              <button
                ref={(element) => { buttons.current[i] = element; }}
                type="button"
                aria-pressed={i === active}
                aria-label={`Afficher la photo ${i + 1} de ${familyName}`}
                onClick={() => setIndex(i)}
                className={`block h-[72px] w-[72px] overflow-hidden border-2 bg-white p-1 ${i === active ? "border-[color:var(--color-brand,#a71c19)]" : "border-line hover:border-line-strong"}`}
              >
                <MediaImage sha256={img.sha256} alt={familyName} className="h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
