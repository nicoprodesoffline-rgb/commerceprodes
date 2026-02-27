"use client";

import { ProductOption, ProductVariant } from "lib/supabase/types";
import { useState, useEffect } from "react";

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

export function VariantSelector({
  options,
  variants,
  onVariantChange,
}: {
  options: ProductOption[];
  variants: ProductVariant[];
  onVariantChange?: (variant: ProductVariant | null) => void;
}) {
  // Only show axes that have ≥ 2 distinct values (single-value axes go to specs)
  const multiValueOptions = options.filter((o) => o.values.length >= 2);
  const hasNoOptionsOrJustOneOption = multiValueOptions.length === 0;

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    // Pre-select first value of each option (including single-value ones for matching)
    const initial: Record<string, string> = {};
    for (const option of options) {
      if (option.values.length > 0) {
        initial[option.name] = option.values[0]!;
      }
    }
    return initial;
  });

  // Find matching variant whenever selectedOptions changes
  useEffect(() => {
    if (!onVariantChange) return;
    const matched = variants.find((v) =>
      Object.entries(selectedOptions).every(([name, value]) =>
        v.selectedOptions.some((o) => o.name === name && o.value === value),
      ),
    );
    onVariantChange(matched ?? null);
  }, [selectedOptions, variants, onVariantChange]);

  if (hasNoOptionsOrJustOneOption) return null;

  const selectOption = (optionName: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [optionName]: value }));
  };

  return (
    <div className="mb-6 space-y-5">
      {multiValueOptions.map((option) => {
        const isColor = isColorOption(option.name);
        const selectedValue = selectedOptions[option.name];

        return (
          <div key={option.id}>
            <p className="mb-2 text-sm font-medium text-gray-700">
              {formatOptionName(option.name)}
              {selectedValue && (
                <span className="ml-2 font-normal text-gray-500">
                  — {formatOptionValue(selectedValue)}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isActive = selectedValue === value;

                if (isColor) {
                  const colorHex = getColorHex(value);
                  const isLight =
                    colorHex === "#f5f5f5" ||
                    colorHex === "#c0c0c0" ||
                    colorHex === "#e5e7eb" ||
                    colorHex === "#d4b896";
                  return (
                    <button
                      key={value}
                      type="button"
                      title={formatOptionValue(value)}
                      onClick={() => selectOption(option.name, value)}
                      style={{ backgroundColor: colorHex }}
                      className={[
                        "h-8 w-8 rounded-full transition-all",
                        isActive
                          ? "ring-2 ring-offset-2 ring-[#cc1818] scale-110 shadow-md"
                          : "ring-1 ring-gray-300 hover:ring-gray-500 hover:scale-105",
                        isLight ? "border border-gray-300" : "",
                      ].join(" ")}
                    />
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectOption(option.name, value)}
                    className={[
                      "rounded-md px-3 py-1.5 text-sm border transition-all",
                      isActive
                        ? "bg-[#cc1818] text-white border-[#cc1818] font-medium"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-500",
                    ].join(" ")}
                  >
                    {formatOptionValue(value)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
