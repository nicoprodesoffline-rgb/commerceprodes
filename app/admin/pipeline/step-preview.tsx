"use client";

import { useState, useMemo } from "react";
import type {
  PuidData,
  PuidProduct,
  PuidVariant,
} from "lib/admin/pipeline-types";

interface Props {
  puidData: PuidData;
  onValidated: () => void;
}

// ── Build options from variants for a given product ───────────────────────

interface ProductOption {
  name: string;
  type: "prix" | "style";
  values: string[];
}

function buildOptions(
  product: PuidProduct,
  variants: PuidVariant[],
): ProductOption[] {
  const options: ProductOption[] = [];

  // Price axes — collect unique values from attributs_prix or price_tokens
  for (const axis of product.axes_prix_effectif ?? []) {
    const values = new Set<string>();
    for (const v of variants) {
      const attrVal = v.attributs_prix?.[axis];
      if (attrVal != null) {
        values.add(String(attrVal));
      }
    }
    if (values.size === 0) {
      for (const v of variants) {
        if (v.price_tokens?.length) {
          v.price_tokens.forEach((t) => values.add(t));
        }
      }
    }
    if (values.size > 0) {
      options.push({
        name: axis,
        type: "prix",
        values: [...values].sort(),
      });
    }
  }

  // Style axes — collect from style_tokens
  for (const axis of product.axes_style_effectif ?? []) {
    const values = new Set<string>();
    // style_tokens are the only source available on PuidVariant
    if (values.size === 0) {
      for (const v of variants) {
        if (v.style_tokens?.length) {
          v.style_tokens.forEach((t) => values.add(t));
        }
      }
    }
    if (values.size > 0) {
      options.push({
        name: axis,
        type: "style",
        values: [...values].sort(),
      });
    }
  }

  return options;
}

function isColorOption(name: string): boolean {
  return /colori|couleur|color/i.test(name);
}

const COLOR_MAP: Record<string, string> = {
  blanc: "#f5f5f5",
  white: "#f5f5f5",
  noir: "#222222",
  black: "#222222",
  gris: "#9ca3af",
  grey: "#9ca3af",
  "gris cryptic": "#7a7d82",
  "gris platinium": "#a8a9ad",
  beige: "#d4c5a9",
  rouge: "#dc2626",
  red: "#dc2626",
  bleu: "#2563eb",
  blue: "#2563eb",
  vert: "#16a34a",
  green: "#16a34a",
  jaune: "#eab308",
  yellow: "#eab308",
  orange: "#ea580c",
  marron: "#78350f",
  taupe: "#87796f",
  anthracite: "#3d3d3d",
  "forest green": "#228b22",
  terracotta: "#c46a47",
  "bleu orage": "#1e3a5f",
  denim: "#1560bd",
  lin: "#c8b88a",
  moutarde: "#c9a824",
  bordeaux: "#6b0f24",
  ivoire: "#fffff0",
};

function getColorHex(value: string): string {
  const v = value.toLowerCase().trim();
  return COLOR_MAP[v] ?? "#d1d5db";
}

// ── Variant selector ──────────────────────────────────────────────────────

function VariantSelector({
  options,
  selected,
  onSelect,
}: {
  options: ProductOption[];
  selected: Record<string, string>;
  onSelect: (axis: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {options.map((opt) => (
        <div key={opt.name}>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {opt.name.charAt(0).toUpperCase() + opt.name.slice(1)}
            {selected[opt.name] && (
              <span className="ml-2 font-normal text-gray-500">
                — {selected[opt.name]}
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((val) => {
              const isActive = selected[opt.name] === val;

              if (isColorOption(opt.name)) {
                const hex = getColorHex(val);
                const isLight = [
                  "#f5f5f5",
                  "#fffff0",
                  "#d4c5a9",
                  "#c8b88a",
                ].includes(hex);
                return (
                  <button
                    key={val}
                    onClick={() => onSelect(opt.name, val)}
                    title={val}
                    className={`h-8 w-8 rounded-full transition-all ${
                      isActive
                        ? "ring-2 ring-[#cc1818] ring-offset-2 scale-110 shadow-md"
                        : `ring-1 ${isLight ? "ring-gray-300" : "ring-gray-200"} hover:ring-gray-500`
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              }

              return (
                <button
                  key={val}
                  onClick={() => onSelect(opt.name, val)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                    isActive
                      ? "border-[#cc1818] bg-[#cc1818] text-white font-medium"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Product preview card ──────────────────────────────────────────────────

function ProductPreview({
  product,
  variants,
}: {
  product: PuidProduct;
  variants: PuidVariant[];
}) {
  const options = useMemo(
    () => buildOptions(product, variants),
    [product, variants],
  );

  // Initialize selection with first value of each option
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of options) {
      if (opt.values.length > 0) init[opt.name] = opt.values[0]!;
    }
    return init;
  });

  // Find matching variant
  const matchedVariant = useMemo(() => {
    if (options.length === 0 && variants.length === 1) return variants[0]!;
    if (options.length === 0) return variants[0] ?? null;

    // Match based on tokens
    return (
      variants.find((v) => {
        const allTokens = [
          ...(v.price_tokens ?? []),
          ...(v.style_tokens ?? []),
        ].map((t) => t.toLowerCase());
        return Object.values(selected).every((sel) =>
          allTokens.some(
            (t) =>
              t === sel.toLowerCase() ||
              t.includes(sel.toLowerCase()) ||
              sel.toLowerCase().includes(t),
          ),
        );
      }) ??
      variants[0] ??
      null
    );
  }, [variants, selected, options]);

  // Price range
  const prices = variants
    .map((v) => v.prix_ht)
    .filter((p): p is number => p != null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const hasRange = minPrice !== maxPrice;

  const displayPrice = matchedVariant?.prix_ht ?? minPrice;

  function formatPrice(price: number): string {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* Left: image placeholder */}
        <div className="lg:col-span-2 bg-gray-100 flex items-center justify-center p-8 min-h-[300px]">
          <div className="text-center text-gray-400">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-sm">Image produit</p>
            <p className="text-xs mt-1 text-gray-300">
              (non disponible en preview)
            </p>
          </div>
        </div>

        {/* Right: product info */}
        <div className="lg:col-span-3 p-6 space-y-5">
          {/* Category */}
          {product.categorie_produit && (
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {product.categorie_produit}
            </p>
          )}

          {/* PUID as SKU */}
          <p className="font-mono text-xs text-gray-400">{product.puid_root}</p>

          {/* Title */}
          <h2 className="text-xl font-semibold text-gray-900 leading-tight">
            {product.nom_gamme}
          </h2>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            {matchedVariant && !hasRange ? (
              <span className="text-2xl font-bold text-gray-900">
                {formatPrice(displayPrice)} € HT
              </span>
            ) : hasRange && !matchedVariant ? (
              <span className="text-2xl font-bold text-gray-900">
                {formatPrice(minPrice)} – {formatPrice(maxPrice)} € HT
              </span>
            ) : (
              <span className="text-2xl font-bold text-gray-900">
                {formatPrice(displayPrice)} € HT
              </span>
            )}
          </div>

          {/* Variant selector */}
          {options.length > 0 && (
            <VariantSelector
              options={options}
              selected={selected}
              onSelect={(axis, value) =>
                setSelected((prev) => ({ ...prev, [axis]: value }))
              }
            />
          )}

          {/* Selected variant info */}
          {matchedVariant && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {matchedVariant.designation}
                </span>
                <span className="font-mono text-xs text-purple-600">
                  {matchedVariant.puid}
                </span>
              </div>
              {matchedVariant.reference && (
                <p className="text-xs text-gray-500">
                  Réf : {matchedVariant.reference}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {matchedVariant.price_tokens?.length > 0 && (
                  <span>
                    Prix :{" "}
                    <span className="rounded bg-purple-50 px-1 py-0.5 text-purple-700">
                      {matchedVariant.price_tokens.join(", ")}
                    </span>
                  </span>
                )}
                {matchedVariant.style_tokens?.length > 0 && (
                  <span>
                    Style :{" "}
                    <span className="rounded bg-indigo-50 px-1 py-0.5 text-indigo-700">
                      {matchedVariant.style_tokens.join(", ")}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Quantity + CTA mock */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">
                Quantité
              </label>
              <input
                type="number"
                defaultValue={1}
                min={1}
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                readOnly
              />
            </div>
            <button
              disabled
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white opacity-60 cursor-not-allowed"
            >
              Ajouter au panier (preview)
            </button>
            <button
              disabled
              className="w-full rounded-lg border-2 border-[#cc1818] px-4 py-2.5 text-sm font-semibold text-[#cc1818] opacity-60 cursor-not-allowed"
            >
              Demander un devis (preview)
            </button>
          </div>
        </div>
      </div>

      {/* Variants table below */}
      <div className="border-t border-gray-200 px-6 py-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Toutes les variantes ({variants.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-gray-500">
                  PUID
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">
                  Réf
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">
                  Désignation
                </th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">
                  Prix HT
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">
                  Attributs prix
                </th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">
                  Attributs style
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const isMatch = matchedVariant === v;
                return (
                  <tr
                    key={i}
                    className={`border-b border-gray-50 ${
                      isMatch ? "bg-blue-50 font-medium" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-2 py-2 font-mono text-purple-600">
                      {v.puid}
                    </td>
                    <td className="px-2 py-2 font-mono text-gray-700">
                      {v.reference ?? "—"}
                    </td>
                    <td className="px-2 py-2">{v.designation}</td>
                    <td className="px-2 py-2 text-right">
                      {v.prix_ht != null ? `${formatPrice(v.prix_ht)} €` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {v.price_tokens?.length > 0 ? (
                        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">
                          {v.price_tokens.join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {v.style_tokens?.length > 0 ? (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                          {v.style_tokens.join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function StepPreview({ puidData, onValidated }: Props) {
  const { products, variants } = puidData;
  const [selectedIdx, setSelectedIdx] = useState(0);

  const currentProduct = products[selectedIdx];
  const currentVariants = currentProduct
    ? variants.filter((v) => v.product_ref === currentProduct.ref)
    : [];

  if (!currentProduct) return null;

  return (
    <div className="space-y-4">
      {/* Navigation bar */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
            disabled={selectedIdx === 0}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-30"
          >
            ← Précédent
          </button>

          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm max-w-[400px]"
          >
            {products.map((p, i) => (
              <option key={p.ref} value={i}>
                {i + 1}. {p.nom_gamme} (
                {variants.filter((v) => v.product_ref === p.ref).length} var.)
              </option>
            ))}
          </select>

          <button
            onClick={() =>
              setSelectedIdx((i) => Math.min(products.length - 1, i + 1))
            }
            disabled={selectedIdx === products.length - 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-30"
          >
            Suivant →
          </button>

          <span className="text-xs text-gray-500">
            {selectedIdx + 1} / {products.length}
          </span>
        </div>

        <button
          onClick={onValidated}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Valider & passer à l'import
        </button>
      </div>

      {/* Product preview */}
      <ProductPreview
        key={currentProduct.ref}
        product={currentProduct}
        variants={currentVariants}
      />
    </div>
  );
}
