"use client";

import type { FamilyView, VariantAxes } from "lib/site-dto/types";
import { axisValueState, type AxisValueState } from "lib/site-dto/variants";

// ── Mapping couleur → CSS color ──────────────────────────────────────────────
const COLOR_KEYWORDS: [string, string][] = [
  ["blanc", "#f5f5f5"],
  ["white", "#f5f5f5"],
  ["noir", "#1a1a1a"],
  ["black", "#1a1a1a"],
  ["rouge", "#cc0000"],
  ["red", "#cc0000"],
  ["bleu fonce", "#1a4080"],
  ["bleu pastel", "#7bb8d4"],
  ["bleu", "#1a4080"],
  ["blue", "#1a4080"],
  ["bordeaux", "#5e1a1a"],
  ["vert fonce", "#1a5c3a"],
  ["vert pastel", "#7bc47e"],
  ["vert", "#1a5c3a"],
  ["green", "#1a5c3a"],
  ["gris soie", "#a0a09a"],
  ["gris ardoise", "#606060"],
  ["gris", "#606060"],
  ["grey", "#606060"],
  ["gray", "#606060"],
  ["jaune", "#f5c400"],
  ["yellow", "#f5c400"],
  ["marron", "#6b3a2a"],
  ["brown", "#6b3a2a"],
  ["magenta", "#cc3399"],
  ["rose", "#e8a0b4"],
  ["saumon", "#f2937a"],
  ["beige", "#d4b896"],
  ["anthracite", "#3a3a3a"],
  ["chrome", "#c0c0c0"],
  ["argent", "#c0c0c0"],
  ["silver", "#c0c0c0"],
  ["or ", "#c8a850"],
  ["gold", "#c8a850"],
  ["orange", "#e07820"],
];

function getColorHex(value: string): string {
  const lower = value.toLowerCase().replace(/-/g, " ").replace(/ral \d+/gi, "").trim();
  for (const [keyword, hex] of COLOR_KEYWORDS) {
    if (lower.includes(keyword)) return hex;
  }
  return "#e5e7eb"; // gris clair par défaut
}

function isColorOption(name: string): boolean {
  const n = name.toLowerCase();
  return n === "coloris" || n === "couleur" || n === "color" || n.includes("coloris");
}

function formatOptionName(name: string): string {
  const overrides: Record<string, string> = {
    "pa_les-lots": "Choix du lot",
    "pa-les-lots": "Choix du lot",
    "pietement": "Piètement",
    "coloris": "Coloris",
    "couleur": "Couleur",
    "taille": "Taille",
    "dimension": "Dimension",
  };
  const lower = name.toLowerCase();
  if (overrides[lower]) return overrides[lower]!;
  // Capitalize first letter, replace _ and - with space
  return name.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatOptionValue(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const STATE_NOTE: Record<Exclude<AxisValueState, "available">, string> = {
  absent: "non proposée",
  forbidden: "combinaison interdite",
};

// BC1-B : piloté par le DTO. Une valeur n'est cliquable que si la combinaison
// (avec les autres axes sélectionnés) correspond à un item READY ; absente ou
// interdite = désactivée, avec la raison affichée (jamais sélectionnable).
export function VariantSelector({
  family,
  selection,
  onSelect,
}: {
  family: FamilyView;
  selection: VariantAxes;
  onSelect: (axis: string, value: string) => void;
}) {
  const axes = family.variant_axes_schema.filter((o) => o.values.length >= 1);
  if (axes.length === 0) return null;

  return (
    <div className="mb-6 space-y-5">
      {axes.map((option) => {
        const isColor = isColorOption(option.axis);
        const selectedValue = selection[option.axis];

        return (
          <fieldset key={option.axis}>
            <legend className="mb-2 text-sm font-medium text-gray-700">
              {formatOptionName(option.axis)}
              {selectedValue && (
                <span className="ml-2 font-normal text-gray-500">
                  — {formatOptionValue(selectedValue)}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isActive = selectedValue === value;
                const state = isActive
                  ? "available"
                  : axisValueState(family, selection, option.axis, value);
                const disabled = state !== "available";
                const note = disabled ? STATE_NOTE[state as "absent" | "forbidden"] : null;
                const label = `${formatOptionName(option.axis)} ${formatOptionValue(value)}${note ? ` (${note})` : ""}`;

                if (isColor) {
                  const colorHex = getColorHex(value);
                  const isLight =
                    colorHex === "#f5f5f5" ||
                    colorHex === "#c0c0c0" ||
                    colorHex === "#e5e7eb" ||
                    colorHex === "#d4b896";
                  return (
                    <span key={value} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={isActive}
                        disabled={disabled}
                        onClick={() => onSelect(option.axis, value)}
                        style={{ backgroundColor: colorHex }}
                        className={[
                          "h-8 w-8 rounded-full transition-all",
                          isActive
                            ? "ring-2 ring-offset-2 ring-[#cc1818] scale-110 shadow-md"
                            : "ring-1 ring-gray-300 hover:ring-gray-500 hover:scale-105",
                          isLight ? "border border-gray-300" : "",
                          disabled ? "cursor-not-allowed opacity-30" : "",
                        ].join(" ")}
                      />
                      {note && <span className="text-[10px] text-gray-500">{note}</span>}
                    </span>
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    aria-pressed={isActive}
                    disabled={disabled}
                    onClick={() => onSelect(option.axis, value)}
                    className={[
                      "rounded-md px-3 py-1.5 text-sm border transition-all",
                      isActive
                        ? "bg-[#cc1818] text-white border-[#cc1818] font-medium"
                        : disabled
                          ? "cursor-not-allowed border-dashed border-gray-300 bg-gray-50 text-gray-400 line-through"
                          : "bg-white text-gray-700 border-gray-300 hover:border-gray-500",
                    ].join(" ")}
                  >
                    {formatOptionValue(value)}
                    {note && <span className="ml-1 text-[10px] no-underline">({note})</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
