"use client";

import { useEffect, useRef, useState } from "react";
import { useShowImages } from "@/components/site/media-policy";
import { mediaPath, pickDerivative, srcSet, type MediaView } from "@/lib/site-catalog/media-view";

/**
 * Image d'un média publié (`/media/<sha256>`). Média manquant ou refusé (octets absents ou altérés : la route
 * répond 404), ou visuels de test non montrables (`MediaPolicyProvider`) → remplacement neutre « Visuel non disponible »,
 * jamais une image cassée silencieuse ni une image synthétique.
 * Le cas où l'erreur survient avant l'hydratation est rattrapé au montage (`complete && naturalWidth === 0`).
 */
export function MediaImage({ sha256, alt, className, testId, width, view, sizes, eager }: {
  sha256: string | null; alt: string; className?: string; testId?: string;
  /** Largeur demandée en px (une vignette de liste demande 320) : le SITE répond par la version réduite qui convient. */
  width?: number;
  /** Les versions réduites de l'image (catalogue v2) : `srcset`, `sizes`, `width` et `height` de la balise (3.3, I10). */
  view?: MediaView | null; sizes?: string;
  /** Image visible dès l'ouverture de la page ; les autres sont chargées au défilement. */
  eager?: boolean;
}) {
  const allowed = useShowImages();
  const [failed, setFailed] = useState(sha256 === null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(sha256 === null);
  }, [sha256]);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [sha256]);
  if (failed || sha256 === null || !allowed) {
    return (
      <div role="img" aria-label={`${alt} — visuel non disponible`} data-testid="media-missing" className={`flex items-center justify-center bg-surface text-center text-sm text-ink-3 ${className ?? ""}`}>
        <span aria-hidden="true" className="px-2">Visuel non disponible</span>
      </div>
    );
  }
  const shown = view && view.derivatives.length > 0 ? view : null;
  const chosen = shown ? pickDerivative(shown.derivatives, width ?? 1024) : null;
  const src = shown && chosen ? mediaPath(chosen.sha256, shown.publicName) : width ? `/media/${sha256}?w=${width}` : `/media/${sha256}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref} src={src} alt={view?.alt ?? alt} onError={() => setFailed(true)} className={`bg-white object-contain ${className ?? ""}`} data-testid={testId}
      loading={eager ? "eager" : "lazy"} decoding="async"
      {...(shown && chosen ? { srcSet: srcSet(shown), sizes: sizes ?? "(min-width: 1024px) 50vw, 100vw", width: chosen.width, height: chosen.height } : {})}
    />
  );
}
