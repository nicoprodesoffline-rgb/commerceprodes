"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type TopCategory = { key: string; name: string };

/**
 * Barre des catégories du haut : une seule ligne défilable. Quand elle déborde, un dégradé et une flèche annoncent ce qui reste de chaque côté (cliquable) ;
 * sans débordement (ou avant hydratation) rien ne s'ajoute. Liens natifs : le clavier fait défiler l'élément focalisé dans la vue.
 */
export function TopCategories({ categories }: { categories: TopCategory[] }) {
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      setEdge({ left: element.scrollLeft > 1, right: max > 1 && element.scrollLeft < max - 1 });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [categories]);

  function move(direction: number) {
    const element = row.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const arrow = "absolute inset-y-0 z-10 flex w-12 items-center text-lg text-ink-2 hover:text-brand";
  return (
    <nav aria-label="Catégories principales" className="relative hidden min-w-0 flex-1 md:block" data-testid="top-categories" data-more-right={edge.right ? "true" : "false"} data-more-left={edge.left ? "true" : "false"}>
      <ul ref={row} className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <li key={c.key} className="flex-none">
            <Link href={`/categorie/${c.key}`} className="inline-flex min-h-12 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-2 hover:border-brand hover:text-brand">{c.name}</Link>
          </li>
        ))}
      </ul>
      {edge.left && (
        <button type="button" onClick={() => move(-1)} aria-label="Catégories précédentes" data-testid="top-categories-prev" className={`${arrow} left-0 justify-start bg-gradient-to-r from-white from-60% to-transparent pl-1`}>‹</button>
      )}
      {edge.right && (
        <button type="button" onClick={() => move(1)} aria-label="Catégories suivantes" data-testid="top-categories-next" className={`${arrow} right-0 justify-end bg-gradient-to-l from-white from-60% to-transparent pr-1`}>›</button>
      )}
    </nav>
  );
}
