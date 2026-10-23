"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type MenuCategory = { key: string; name: string; children: { key: string; name: string }[] };

/**
 * Menu « Catégories » (bouton de divulgation, WAI-ARIA disclosure) : Entrée/Espace ouvre, Échap ferme et rend
 * le focus au bouton, clic extérieur ferme. Catégories et ordre = ceux du DTO (aucun merchandising).
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
    <div className="relative">
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
        className="absolute left-0 z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-white p-3 shadow-lg"
      >
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.key}>
              <Link href={`/categorie/${c.key}`} onClick={() => setOpen(false)} className="flex min-h-[34px] items-center rounded-[9px] px-2 font-semibold hover:bg-surface">
                {c.name}
              </Link>
              {c.children.length > 0 && (
                <ul className="ml-3 border-l border-line pl-2">
                  {c.children.map((s) => (
                    <li key={s.key}>
                      <Link href={`/categorie/${s.key}`} onClick={() => setOpen(false)} className="flex min-h-[34px] items-center rounded-[9px] px-2 text-ink-2 hover:bg-surface hover:text-ink">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
