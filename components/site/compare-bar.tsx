"use client";

import Link from "next/link";
import { KEYS, LIMITS, clearList, useLocalList } from "@/components/site/local-list";

/** Barre fixe du comparateur (T-T11) : visible dès qu'une famille est sélectionnée ; au-dessus de la barre mobile basse. */
export function CompareBar() {
  const list = useLocalList(KEYS.compare);
  if (list.length === 0) return null;
  return (
    <div role="region" aria-label="Comparateur" className="fixed inset-x-0 bottom-14 z-30 border-t border-line bg-white px-4 py-2 shadow-lg md:bottom-0 print:hidden" data-testid="compare-bar">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm">
          {list.length === 1 ? "Ajoutez au moins un autre produit pour comparer." : `${list.length} produits à comparer`}
          {list.length >= LIMITS[KEYS.compare] ? <span className="text-ink-3"> (maximum atteint)</span> : null}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => clearList(KEYS.compare)} className="h-[34px] rounded-[9px] border border-line-strong bg-white px-3 text-sm hover:bg-surface">Vider</button>
          {list.length >= 2 ? (
            <Link href="/comparer" className="inline-flex h-[34px] items-center rounded-[9px] bg-ink px-4 text-sm font-medium text-white">Comparer ({list.length})</Link>
          ) : (
            <span className="inline-flex h-[34px] items-center rounded-[9px] bg-surface-subtle px-4 text-sm text-ink-3" aria-disabled="true">Comparer</span>
          )}
        </div>
      </div>
    </div>
  );
}
