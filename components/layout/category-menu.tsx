"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type MenuCategory = { key: string; name: string; children: MenuCategory[] };

/**
 * Menu « Catégories » (bouton de divulgation, WAI-ARIA disclosure) : Entrée/Espace ouvre, Échap ferme et rend
 * le focus au bouton, clic extérieur ou sortie du focus ferme. Jusqu'à 3 niveaux (la navigation en garantit le maximum,
 * `lib/site-catalog/navigation.ts`). Catégories et ordre = ceux du DTO (aucun merchandising).
 */
export function CategoryMenu({ categories }: { categories: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (categories.length === 0) return null;
  return (
    <div
      className="sm:relative"
      data-testid="category-menu"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[42px] items-center gap-2 rounded-[9px] px-3 font-medium hover:bg-surface"
      >
        Catégories <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        // Appuyer (souris ou toucher) sur une zone non interactive du panneau (marge, bord, barre de défilement) ne doit
        // pas déplacer le focus hors du menu : sinon onBlur (relatedTarget nul) le fermerait.
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("a,button")) e.preventDefault();
        }}
        className="absolute inset-x-4 z-40 mt-1 max-h-[70vh] overflow-y-auto sm:inset-x-auto sm:left-0 sm:w-[22rem] rounded-[14px] border border-line bg-white p-3 shadow-lg"
      >
        <MenuList items={categories} level={1} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}

function MenuList({ items, level, onNavigate, label }: { items: MenuCategory[]; level: number; onNavigate: () => void; label?: string }) {
  return (
    <ul aria-label={label} className={level === 1 ? "space-y-2" : "ml-3 border-l border-line pl-2"} data-level={level}>
      {items.map((c) => (
        <li key={c.key}>
          <Link
            href={`/categorie/${c.key}`}
            onClick={onNavigate}
            className={`flex min-h-[34px] items-center rounded-[9px] px-2 hover:bg-surface ${level === 1 ? "font-semibold" : level === 2 ? "text-ink-2 hover:text-ink" : "text-sm text-ink-2 hover:text-ink"}`}
          >
            {c.name}
          </Link>
          {c.children.length > 0 && <MenuList items={c.children} level={level + 1} onNavigate={onNavigate} label={`Sous-catégories de ${c.name}`} />}
        </li>
      ))}
    </ul>
  );
}
