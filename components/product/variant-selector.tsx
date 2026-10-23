"use client";

/**
 * Sélecteur de variante : un groupe de boutons radio par axe (`axes[]` du DTO, libellés du DTO). Une valeur n'est
 * sélectionnable que si un Item PUBLIÉ porte cette valeur ET les valeurs déjà choisies des autres axes : aucune
 * combinaison n'est construite (aucun produit cartésien, C0 §8.3). Une valeur non proposée avec la sélection
 * courante est désactivée ET expliquée sous le groupe ; la liste « Variantes proposées » permet d'atteindre
 * directement toute variante publiée. Clavier : flèches dans un groupe (radio natif), Tab entre groupes.
 */
import { useId } from "react";
import { axisValue } from "@/components/site/format";

export type SelectorAxis = { axis: string; label: string; values: string[] };
export type SelectorItem = { public_item_key: string; variant_axes: Record<string, string> };

export function VariantSelector({
  options,
  items,
  selectedKey,
  onSelect,
}: {
  options: SelectorAxis[];
  items: SelectorItem[];
  selectedKey: string;
  onSelect: (itemKey: string) => void;
}) {
  const base = useId();
  const selected = items.find((i) => i.public_item_key === selectedKey)?.variant_axes ?? {};
  if (options.length === 0) return null;

  const target = (axis: string, value: string) =>
    items.find((i) => i.variant_axes[axis] === value && Object.entries(selected).every(([k, v]) => k === axis || i.variant_axes[k] === v));

  return (
    <div className="space-y-4" data-testid="variant-selector">
      {options.map((option) => {
        const current = selected[option.axis];
        if (option.values.length === 1) {
          return (
            <p key={option.axis} className="text-sm">
              <span className="font-medium">{option.label}</span> : {axisValue(option.values[0]!)} <span className="text-ink-3">(seule option)</span>
            </p>
          );
        }
        const others = options.filter((o) => o.axis !== option.axis && selected[o.axis] !== undefined);
        const unavailable = option.values.filter((v) => !target(option.axis, v));
        const hintId = `${base}-${option.axis}-hint`;
        return (
          <fieldset key={option.axis} aria-describedby={unavailable.length > 0 ? hintId : undefined}>
            <legend className="mb-2 text-sm font-medium">
              {option.label}
              {current !== undefined && <span className="font-normal text-ink-2"> : {axisValue(current)}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const t = target(option.axis, value);
                const id = `${base}-${option.axis}-${value}`;
                return (
                  <label
                    key={value}
                    htmlFor={id}
                    className={[
                      "relative inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-[9px] border px-3 text-sm",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      !t
                        ? "cursor-not-allowed border-dashed border-line-strong bg-surface text-ink-3 line-through"
                        : current === value
                          ? "cursor-pointer border-ink bg-ink font-medium text-white"
                          : "cursor-pointer border-line-strong bg-white hover:border-ink-3",
                    ].join(" ")}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={`${base}-${option.axis}`}
                      value={value}
                      checked={current === value}
                      disabled={!t}
                      onChange={() => t && onSelect(t.public_item_key)}
                      className="sr-only"
                    />
                    {axisValue(value)}
                    {!t && <span className="sr-only"> (non proposé avec la sélection actuelle)</span>}
                  </label>
                );
              })}
            </div>
            {unavailable.length > 0 && (
              <p id={hintId} className="mt-1.5 text-xs text-ink-2">
                Non proposé{others.length > 0 ? <> avec {others.map((o) => `${o.label} « ${axisValue(selected[o.axis]!)} »`).join(" et ")}</> : null} :{" "}
                {unavailable.map(axisValue).join(", ")}. Changez d&apos;abord une autre option ou choisissez dans la liste des variantes proposées.
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
