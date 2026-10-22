"use client";


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

export type SelectorAxis = { axis: string; values: string[] };
export type SelectorItem = { public_item_key: string; variant_axes: Record<string, string> };

/**
 * ADAPT (BC1-D) : n'expose que les items READY du snapshot. Une valeur est
 * cliquable si au moins un item READY la porte ; la combinaison exacte est
 * résolue vers un item READY (jamais vers une combinaison interdite/absente).
 */
export function VariantSelector({
  options,
  items,
  selectedKey,
  onSelect,
  unavailableNotes = [],
}: {
  options: SelectorAxis[];
  items: SelectorItem[];
  selectedKey: string;
  onSelect: (itemKey: string) => void;
  unavailableNotes?: string[];
}) {
  const multiValueOptions = options.filter((o) => o.values.length >= 2);
  if (multiValueOptions.length === 0) return null;
  const selected = items.find((i) => i.public_item_key === selectedKey)?.variant_axes ?? {};

  const pick = (axis: string, value: string) => {
    const wanted = { ...selected, [axis]: value };
    const exact = items.find((i) => Object.entries(wanted).every(([k, v]) => i.variant_axes[k] === v));
    const fallback = items.find((i) => i.variant_axes[axis] === value);
    const target = exact ?? fallback;
    if (target) onSelect(target.public_item_key);
  };

  const existsWithOthers = (axis: string, value: string) =>
    items.some((i) =>
      i.variant_axes[axis] === value &&
      Object.entries(selected).every(([k, v]) => k === axis || i.variant_axes[k] === v),
    );

  return (
    <div className="mb-6 space-y-5">
      {multiValueOptions.map((option) => {
        const isColor = isColorOption(option.axis);
        const selectedValue = selected[option.axis];
        const labelId = `axis-${option.axis}`;

        return (
          <div key={option.axis}>
            <p id={labelId} className="mb-2 text-sm font-medium text-gray-700">
              {formatOptionName(option.axis)}
              {selectedValue && (
                <span className="ml-2 font-normal text-gray-500">
                  — {formatOptionValue(selectedValue)}
                </span>
              )}
            </p>
            <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isActive = selectedValue === value;
                const published = items.some((i) => i.variant_axes[option.axis] === value);
                const compatible = existsWithOthers(option.axis, value);
                const title = !published
                  ? `${formatOptionValue(value)} — non proposé`
                  : compatible
                    ? formatOptionValue(value)
                    : `${formatOptionValue(value)} — change aussi une autre option`;

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
                      title={title}
                      aria-label={title}
                      aria-pressed={isActive}
                      disabled={!published}
                      onClick={() => pick(option.axis, value)}
                      style={{ backgroundColor: colorHex }}
                      className={[
                        "h-8 w-8 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30",
                        isActive
                          ? "ring-2 ring-offset-2 ring-[#cc1818] scale-110 shadow-md"
                          : "ring-1 ring-gray-300 hover:ring-gray-500 hover:scale-105",
                        isLight ? "border border-gray-300" : "",
                        !compatible && !isActive ? "outline-dashed outline-1 outline-gray-400" : "",
                      ].join(" ")}
                    />
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    title={title}
                    aria-pressed={isActive}
                    disabled={!published}
                    onClick={() => pick(option.axis, value)}
                    className={[
                      "rounded-md px-3 py-1.5 text-sm border transition-all disabled:cursor-not-allowed disabled:opacity-40",
                      isActive
                        ? "bg-[#cc1818] text-white border-[#cc1818] font-medium"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-500",
                      !compatible && !isActive ? "border-dashed" : "",
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
      {unavailableNotes.length > 0 && (
        <ul className="text-xs text-gray-500" data-testid="unavailable-combinations">
          {unavailableNotes.map((n) => (
            <li key={n}>Combinaison non proposée : {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
