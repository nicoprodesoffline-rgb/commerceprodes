"use client";

import { useCompare } from "lib/compare/context";

interface CompareButtonProps {
  handle: string;
  title: string;
}

export default function CompareButton({ handle, title }: CompareButtonProps) {
  const { addToCompare, removeFromCompare, isInCompare } = useCompare();
  const inList = isInCompare(handle);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inList) {
      removeFromCompare(handle);
    } else {
      addToCompare(handle);
    }
  }

  return (
    <button
      onClick={handleClick}
      title={inList ? `Retirer ${title} du comparateur` : `Comparer ${title}`}
      className={`mt-1.5 text-xs transition-colors ${
        inList
          ? "font-medium text-[#cc1818]"
          : "text-gray-400 hover:text-[#cc1818]"
      }`}
    >
      {inList ? "✓ Comparé" : "⊕ Comparer"}
    </button>
  );
}
