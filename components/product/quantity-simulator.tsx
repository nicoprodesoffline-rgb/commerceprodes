"use client";

import { useState, useMemo } from "react";

// ── Simulator configs by category/tag keywords ──────────────
type SimulatorConfig = {
  name: string;
  icon: string;
  inputs: Array<{
    id: string;
    label: string;
    unit: string;
    placeholder: string;
    min: number;
    max: number;
    defaultValue: number;
  }>;
  compute: (inputs: Record<string, number>) => SimulatorResult;
  hint: string;
};

type SimulatorResult = {
  qty: number;
  min: number;
  max: number;
  explanation: string;
};

const CONFIGS: Record<string, SimulatorConfig> = {
  siege: {
    name: "Sièges / Chaises",
    icon: "🪑",
    inputs: [
      { id: "personnes", label: "Nombre de personnes", unit: "pers.", placeholder: "ex: 50", min: 1, max: 5000, defaultValue: 50 },
      { id: "rotation", label: "Rotations par jour", unit: "rot.", placeholder: "1 ou 2", min: 1, max: 5, defaultValue: 1 },
    ],
    compute: (v) => {
      const personnes = v["personnes"] ?? 50;
      const rotation = v["rotation"] ?? 1;
      const base = Math.ceil(personnes / rotation);
      return {
        qty: base,
        min: Math.ceil(base * 0.9),
        max: Math.ceil(base * 1.2),
        explanation: `${personnes} personnes ÷ ${rotation} rotation(s) = ${base} sièges`,
      };
    },
    hint: "Prévoir +10–20% pour rotation et remplacement.",
  },
  table: {
    name: "Tables",
    icon: "🪞",
    inputs: [
      { id: "personnes", label: "Nombre de convives", unit: "pers.", placeholder: "ex: 50", min: 1, max: 5000, defaultValue: 50 },
      { id: "places", label: "Places par table", unit: "pl./table", placeholder: "ex: 6", min: 2, max: 20, defaultValue: 6 },
    ],
    compute: (v) => {
      const personnes = v["personnes"] ?? 50;
      const places = v["places"] ?? 6;
      const base = Math.ceil(personnes / places);
      return {
        qty: base,
        min: base,
        max: Math.ceil(base * 1.1),
        explanation: `${personnes} convives ÷ ${places} places/table = ${base} tables`,
      };
    },
    hint: "Ajouter 1–2 tables tampons pour la flexibilité.",
  },
  banc: {
    name: "Bancs / Mobilier urbain",
    icon: "🪑",
    inputs: [
      { id: "surface", label: "Surface de l'espace (m²)", unit: "m²", placeholder: "ex: 500", min: 10, max: 100000, defaultValue: 500 },
      { id: "ratio", label: "Places assises souhaitées / 100 m²", unit: "pl./100m²", placeholder: "ex: 8", min: 1, max: 50, defaultValue: 8 },
      { id: "places_banc", label: "Places par banc", unit: "pl.", placeholder: "ex: 3", min: 1, max: 10, defaultValue: 3 },
    ],
    compute: (v) => {
      const surface = v["surface"] ?? 500;
      const ratio = v["ratio"] ?? 8;
      const places_banc = v["places_banc"] ?? 3;
      const totalPlaces = Math.ceil((surface / 100) * ratio);
      const base = Math.ceil(totalPlaces / places_banc);
      return {
        qty: base,
        min: Math.ceil(base * 0.8),
        max: Math.ceil(base * 1.3),
        explanation: `${surface} m² × ${ratio} pl./100m² = ${totalPlaces} places → ${base} bancs`,
      };
    },
    hint: "Norme recommandée : 6–10 places assises pour 100 m² d'espace public.",
  },
  poubelle: {
    name: "Corbeilles / Poubelles",
    icon: "🗑",
    inputs: [
      { id: "surface", label: "Surface (m²)", unit: "m²", placeholder: "ex: 1000", min: 10, max: 500000, defaultValue: 1000 },
      { id: "frequentation", label: "Fréquentation (pers./jour)", unit: "pers./j", placeholder: "ex: 200", min: 1, max: 50000, defaultValue: 200 },
    ],
    compute: (v) => {
      const surface = v["surface"] ?? 1000;
      const frequentation = v["frequentation"] ?? 200;
      // 1 corbeille pour 100-200m² ou 50 personnes
      const byArea = Math.ceil(surface / 150);
      const byPeople = Math.ceil(frequentation / 50);
      const base = Math.max(byArea, byPeople);
      return {
        qty: base,
        min: Math.ceil(base * 0.8),
        max: Math.ceil(base * 1.2),
        explanation: `Surface: ${byArea} corbeilles, Fréquentation: ${byPeople} → recommandé: ${base}`,
      };
    },
    hint: "1 corbeille pour 100–200 m² ou 50 personnes/jour (norme indicative).",
  },
  barriere: {
    name: "Barrières / Clôtures",
    icon: "🚧",
    inputs: [
      { id: "lineaire", label: "Linéaire à équiper (m)", unit: "m", placeholder: "ex: 50", min: 1, max: 100000, defaultValue: 50 },
      { id: "longueur_module", label: "Longueur d'un élément (cm)", unit: "cm", placeholder: "ex: 200", min: 50, max: 500, defaultValue: 200 },
    ],
    compute: (v) => {
      const lineaire = v["lineaire"] ?? 50;
      const longueur_module = v["longueur_module"] ?? 200;
      const base = Math.ceil((lineaire * 100) / longueur_module);
      return {
        qty: base,
        min: base,
        max: base + 2,
        explanation: `${lineaire} m ÷ ${longueur_module / 100} m/élément = ${base} éléments`,
      };
    },
    hint: "Prévoir 2 éléments supplémentaires pour poteaux et angles.",
  },
};

function detectConfig(categoryName?: string, tags?: string[]): SimulatorConfig | null {
  const text = [categoryName ?? "", ...(tags ?? [])].join(" ").toLowerCase();
  if (/(siège|chaise|fauteuil|assise|tabouret)/.test(text)) return CONFIGS.siege!;
  if (/(table|bureau|plan de travail)/.test(text)) return CONFIGS.table!;
  if (/(banc|mobilier urbain|banquette)/.test(text)) return CONFIGS.banc!;
  if (/(poubelle|corbeille|bac à déchets|propreté)/.test(text)) return CONFIGS.poubelle!;
  if (/(barrière|clôture|grillage|séparation|potelet)/.test(text)) return CONFIGS.barriere!;
  return null;
}

interface QuantitySimulatorProps {
  productHandle: string;
  categoryName?: string;
  tags?: string[];
  onApply?: (qty: number) => void;
}

export function QuantitySimulator({ categoryName, tags, onApply }: QuantitySimulatorProps) {
  const config = useMemo(() => detectConfig(categoryName, tags), [categoryName, tags]);
  const [values, setValues] = useState<Record<string, number>>(() => {
    if (!config) return {};
    return Object.fromEntries(config.inputs.map((i) => [i.id, i.defaultValue]));
  });
  const [applied, setApplied] = useState(false);
  const [open, setOpen] = useState(false);

  if (!config) return null;

  const result: SimulatorResult = config.compute(values);

  function handleApply() {
    onApply?.(result.qty);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }

  return (
    <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-semibold text-blue-900">
            Simulateur de quantité — {config.name}
          </span>
        </div>
        <span className="text-blue-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-blue-200 px-4 py-4">
          <div className="space-y-3">
            {config.inputs.map((input) => (
              <div key={input.id}>
                <label className="mb-1 block text-xs font-medium text-blue-800">
                  {input.label} <span className="text-blue-400">({input.unit})</span>
                </label>
                <input
                  type="number"
                  min={input.min}
                  max={input.max}
                  value={values[input.id] ?? input.defaultValue}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [input.id]: Math.max(input.min, Math.min(input.max, Number(e.target.value) || input.defaultValue)),
                    }))
                  }
                  placeholder={input.placeholder}
                  className="w-full rounded border border-blue-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Result */}
          <div className="mt-4 rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-blue-800">{result.qty}</p>
            <p className="text-xs text-blue-600">unités recommandées</p>
            <p className="mt-1 text-[10px] text-gray-500">(plage : {result.min} – {result.max})</p>
            <p className="mt-2 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700 font-mono">
              {result.explanation}
            </p>
          </div>

          {config.hint && (
            <p className="mt-2 text-[10px] text-blue-500 italic">{config.hint}</p>
          )}

          {onApply && (
            <button
              onClick={handleApply}
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {applied ? "✓ Quantité appliquée" : `Appliquer ${result.qty} au panier`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
