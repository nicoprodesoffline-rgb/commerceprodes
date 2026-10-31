"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Défilement natif et tactile, enrichi de flèches seulement après hydratation et en cas de débordement. */
export function CarouselRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ overflow: false, start: true, end: true });

  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      setPosition({ overflow: max > 1, start: element.scrollLeft <= 1, end: element.scrollLeft >= max - 1 });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [children]);

  function move(direction: number) {
    const element = row.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const button = "hidden md:inline-flex h-[42px] w-[42px] items-center justify-center rounded-[9px] border border-line-strong bg-white text-lg hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="min-w-0">
      {position.overflow && (
        <div className="mb-2 flex justify-end gap-2">
          <button type="button" aria-label="Précédent" aria-controls={id} disabled={position.start} onClick={() => move(-1)} className={button}>←</button>
          <button type="button" aria-label="Suivant" aria-controls={id} disabled={position.end} onClick={() => move(1)} className={button}>→</button>
        </div>
      )}
      <div id={id} ref={row} tabIndex={0} role="region" aria-label={label} className="w-full min-w-0 snap-x snap-mandatory overflow-x-auto pb-3">
        <ul className="flex gap-4 [overflow-wrap:anywhere] [&>li]:w-[min(80vw,300px)] [&>li]:shrink-0 [&>li]:snap-start">{children}</ul>
      </div>
    </div>
  );
}
