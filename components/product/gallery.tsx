"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MediaImage } from "@/components/site/media-image";
import { useShowImages } from "@/components/site/media-policy";
import { mediaPath, pickDerivative, type MediaView } from "@/lib/site-catalog/media-view";

/** `view` : les versions réduites de l'image (catalogue v2), quand elle en a (3.3). */
export type GalleryImage = { sha256: string; caption: string; view?: MediaView | null };

/** Médias du produit uniquement, dans leur ordre d'origine ; les visuels non montrables ne créent pas de vignettes. */
export function Gallery({ familyName, images, focusSha }: {
  familyName: string; images: GalleryImage[];
  /** L'image de la variante choisie (3.6) : la galerie l'affiche ; `null` = retour à la vue principale. Posé par la fiche, jamais par l'écran de la galerie. */
  focusSha?: string | null;
}) {
  const allowed = useShowImages();
  const [index, setIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = allowed ? images.filter((img) => Boolean(img.sha256)) : [];
  const active = index < visible.length ? index : 0;
  const current = visible[active];
  useEffect(() => {
    if (focusSha === undefined) return;
    const target = focusSha === null ? 0 : visible.findIndex((img) => img.sha256 === focusSha);
    setIndex(target >= 0 ? target : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSha]);
  // Cliquer l'image principale ouvre la plus grande version disponible (I11).
  const largest = current?.view ? pickDerivative(current.view.derivatives) : null;
  const openHref = current ? (largest && current.view ? mediaPath(largest.sha256, current.view.publicName) : `/media/${current.sha256}`) : null;

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
        {openHref && current ? (
          <a href={openHref} target="_blank" rel="noopener" aria-label={`Ouvrir la photo de ${familyName} en grand`} data-testid="family-image-open">
            <MediaImage
              sha256={current.sha256} alt={familyName} view={current.view} eager sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] max-h-[50vh] w-full bg-white object-contain lg:aspect-square lg:max-h-none" testId="family-image"
            />
          </a>
        ) : (
          <MediaImage sha256={null} alt={familyName} className="aspect-[4/3] max-h-[50vh] w-full bg-white object-contain lg:aspect-square lg:max-h-none" testId="family-image" />
        )}
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
                <MediaImage sha256={img.sha256} alt={familyName} width={320} className="h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
