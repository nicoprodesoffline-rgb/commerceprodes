"use client";

/**
 * Sélecteur de variante : un groupe de boutons radio par axe (`axes[]` du DTO, libellés du DTO), axes « type » en premier. Sélecteur à choix épinglés
 * (`lib/site-catalog/variant-choice.ts`) : seuls les clics de l'acheteur sont des choix ; une valeur sans variante publiée avec ces
 * choix est GRISÉE mais reste cliquable — le clic ajuste les autres axes sur une variante publiée réelle (aucune combinaison construite, C0 §8.3) et le dit ;
 * recliquer un choix le retire. Clavier : flèches dans un groupe (radio natif), Tab entre groupes.
 */
import { useId, useState } from "react";
import { axisValue } from "@/components/site/format";
import { isColorAxis, swatchFor } from "@/lib/site-catalog/color-swatch";
import { adjustments, click, compatible, orderAxes, type Adjustment, type Pinned } from "@/lib/site-catalog/variant-choice";

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
  const [pinned, setPinned] = useState<Pinned>({});
  const [adjusted, setAdjusted] = useState<Adjustment[]>([]);
  const selected = items.find((i) => i.public_item_key === selectedKey)?.variant_axes ?? {};
  if (options.length === 0) return null;
  const ordered = orderAxes(options);
  const labelOf = (axis: string) => options.find((o) => o.axis === axis)?.label ?? axis;

  /** Un clic (ou une flèche) sur `axis = value` : choix épinglé, ajustement des autres axes si besoin, ou retrait du choix. */
  function choose(axis: string, value: string) {
    const next = click(items, { key: selectedKey, pinned }, axis, value);
    setPinned(next.pinned);
    setAdjusted(next.key === selectedKey ? [] : adjustments(items, selectedKey, next.key, axis));
    if (next.key !== selectedKey) onSelect(next.key);
  }

  return (
    <div className="space-y-4" data-testid="variant-selector">
      {ordered.map((option) => {
        const current = selected[option.axis];
        const colorAxis = isColorAxis(option.axis, option.label);
        if (option.values.length === 1) {
          const backgroundColor = colorAxis ? swatchFor(option.values[0]!) : null;
          return (
            <p key={option.axis} className="text-sm">
              <span className="font-medium">{option.label}</span> : {backgroundColor && (
                <span aria-hidden="true" className="mr-2 inline-block h-4 w-4 rounded-full border border-line-strong align-middle" style={{ backgroundColor }} />
              )}{axisValue(option.values[0]!)} <span className="text-ink-3">(seule option)</span>
            </p>
          );
        }
        const others = ordered.filter((o) => o.axis !== option.axis && pinned[o.axis] !== undefined);
        const greyed = option.values.filter((v) => !compatible(items, pinned, option.axis, v));
        const hintId = `${base}-${option.axis}-hint`;
        return (
          <fieldset key={option.axis} aria-describedby={greyed.length > 0 ? hintId : undefined} data-axis={option.axis}>
            <legend className="mb-2 text-sm font-medium">
              {option.label}
              {current !== undefined && <span className="font-normal text-ink-2"> : {axisValue(current)}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const ok = compatible(items, pinned, option.axis, value);
                const id = `${base}-${option.axis}-${value}`;
                const backgroundColor = colorAxis ? swatchFor(value) : null;
                return (
                  <label
                    key={value}
                    htmlFor={id}
                    title={ok ? undefined : "Aucune variante avec vos choix : cliquer ajustera les autres choix"}
                    className={[
                      "relative inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[9px] border px-3 text-sm",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      current === value
                        ? "border-ink bg-ink font-medium text-white"
                        : ok
                          ? "border-line-strong bg-white hover:border-ink-3"
                          : "border-dashed border-line-strong bg-surface text-ink-3 hover:border-ink-3",
                    ].join(" ")}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={`${base}-${option.axis}`}
                      value={value}
                      checked={current === value}
                      data-compatible={ok ? "true" : "false"}
                      onChange={() => choose(option.axis, value)}
                      onClick={() => {
                        if (current === value) choose(option.axis, value); // valeur déjà affichée : le clic l'épingle, ou retire le choix déjà épinglé
                      }}
                      className="sr-only"
                    />
                    {backgroundColor && (
                      <span aria-hidden="true" className="mr-2 h-4 w-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor }} />
                    )}
                    {axisValue(value)}
                    {!ok && <span className="sr-only"> (aucune variante avec vos choix : un clic ajuste les autres choix)</span>}
                  </label>
                );
              })}
            </div>
            {greyed.length > 0 && (
              <p id={hintId} className="mt-1.5 text-xs text-ink-2">
                Grisé : aucune variante publiée{others.length > 0 ? <> avec {others.map((o) => `${o.label} « ${axisValue(pinned[o.axis]!)} »`).join(" et ")}</> : null} :{" "}
                {greyed.map(axisValue).join(", ")}. Un clic ajuste les autres choix.
              </p>
            )}
          </fieldset>
        );
      })}
      <p role="status" aria-live="polite" className="text-xs text-ink-2" data-testid="variant-adjusted">
        {adjusted.length > 0 && <>Autres choix ajustés pour garder une variante publiée : {adjusted.map((a) => `${labelOf(a.axis)} « ${axisValue(a.from)} » → « ${axisValue(a.to)} »`).join(", ")}.</>}
      </p>
    </div>
  );
}
