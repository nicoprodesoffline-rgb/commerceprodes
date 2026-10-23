"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Image d'un média publié (`/media/<sha256>`). Média manquant ou refusé (octets absents ou altérés : la route
 * répond 404) → remplacement neutre + mention « Image indisponible », jamais une image cassée silencieuse.
 * Le cas où l'erreur survient avant l'hydratation est rattrapé au montage (`complete && naturalWidth === 0`).
 */
export function MediaImage({ sha256, alt, className, testId }: { sha256: string | null; alt: string; className?: string; testId?: string }) {
  const [failed, setFailed] = useState(sha256 === null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(sha256 === null);
  }, [sha256]);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [sha256]);
  if (failed || sha256 === null) {
    return (
      <div role="img" aria-label={`${alt} — image indisponible`} data-testid="media-missing" className={`flex items-center justify-center bg-surface text-center text-sm text-ink-3 ${className ?? ""}`}>
        <span aria-hidden="true" className="px-2">Image indisponible</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={`/media/${sha256}`} alt={alt} onError={() => setFailed(true)} className={`bg-white object-contain ${className ?? ""}`} data-testid={testId} />
  );
}
