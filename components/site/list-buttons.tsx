"use client";

import { useState } from "react";
import { KEYS, LIMITS, toggleInList, useLocalList } from "@/components/site/local-list";

/** Cœur « Ma sélection » (favoris du navigateur). Bouton à bascule : l'état est dit par `aria-pressed` et par le texte, jamais par la couleur seule. */
export function WishlistButton({ slug, name, compact = false }: { slug: string; name: string; compact?: boolean }) {
  const list = useLocalList(KEYS.wishlist);
  const on = list.includes(slug);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleInList(KEYS.wishlist, slug)}
      title={on ? "Retirer de ma sélection" : "Ajouter à ma sélection"}
      className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[9px] border px-2.5 text-xs font-medium ${on ? "border-signal bg-signal-subtle text-signal" : "border-line-strong bg-white text-ink-2 hover:bg-surface"}`}
    >
      <span aria-hidden="true">{on ? "♥" : "♡"}</span>
      <span className={compact ? "sr-only" : ""}>{on ? "Dans ma sélection" : "Ma sélection"}</span>
      <span className="sr-only"> : {name}</span>
    </button>
  );
}

/** « Comparer » (au plus 4 familles). Quand la liste est pleine, le refus est dit à côté du bouton. */
export function CompareButton({ slug, name }: { slug: string; name: string }) {
  const list = useLocalList(KEYS.compare);
  const [full, setFull] = useState(false);
  const on = list.includes(slug);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setFull(toggleInList(KEYS.compare, slug) === "max")}
        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[9px] border px-2.5 text-xs font-medium ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink-2 hover:bg-surface"}`}
      >
        <span aria-hidden="true">{on ? "✓" : "⊕"}</span>
        <span>{on ? "Comparé" : "Comparer"}</span>
        <span className="sr-only"> : {name}</span>
      </button>
      {full && !on && <span role="alert" className="mt-1 text-xs text-caution">Maximum {LIMITS[KEYS.compare]} produits dans le comparateur.</span>}
    </span>
  );
}
