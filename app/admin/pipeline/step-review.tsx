"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { adminFetch } from "lib/admin/fetch";
import type {
  ExpandedData,
  ExpandedProduct,
  ExpandedVariant,
  ExpandedCorrection,
} from "lib/admin/pipeline-types";

// ── Field definitions for the variant table ───────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "array" | "readonly";
  width?: string;
  group: "core" | "pricing" | "logistics" | "computed" | "meta";
}

const VARIANT_FIELDS: FieldDef[] = [
  {
    key: "reference",
    label: "Réf",
    type: "text",
    group: "core",
    width: "min-w-[100px]",
  },
  {
    key: "designation",
    label: "Désignation",
    type: "text",
    group: "core",
    width: "min-w-[220px]",
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    group: "core",
    width: "min-w-[180px]",
  },
  { key: "prix_ht", label: "Prix HT", type: "number", group: "pricing" },
  { key: "prix_net", label: "Prix net", type: "number", group: "pricing" },
  { key: "remise", label: "Remise", type: "number", group: "pricing" },
  {
    key: "eco_contribution",
    label: "Eco-contrib.",
    type: "number",
    group: "pricing",
  },
  // dynamic attributs_prix_computed columns inserted here
  // dynamic attributs_style_computed columns inserted here
  { key: "matiere", label: "Matière", type: "text", group: "core" },
  { key: "coloris_liste", label: "Coloris", type: "array", group: "core" },
  { key: "taille", label: "Taille", type: "text", group: "logistics" },
  { key: "dimensions", label: "Dimensions", type: "text", group: "logistics" },
  {
    key: "dimensions_colis",
    label: "Dim. colis",
    type: "text",
    group: "logistics",
  },
  { key: "poids", label: "Poids (kg)", type: "number", group: "logistics" },
  {
    key: "volume_unite",
    label: "Volume (m³)",
    type: "number",
    group: "logistics",
  },
  { key: "vendu_par", label: "Vendu par", type: "number", group: "logistics" },
  { key: "pcb", label: "PCB", type: "number", group: "logistics" },
  {
    key: "palette_qte",
    label: "Palette qté",
    type: "number",
    group: "logistics",
  },
  {
    key: "palier_min",
    label: "Palier min",
    type: "number",
    group: "logistics",
  },
  {
    key: "palier_max",
    label: "Palier max",
    type: "number",
    group: "logistics",
  },
  { key: "franco", label: "Franco", type: "number", group: "logistics" },
  {
    key: "container_20",
    label: "Cont. 20'",
    type: "number",
    group: "logistics",
  },
  {
    key: "container_40",
    label: "Cont. 40'",
    type: "number",
    group: "logistics",
  },
  { key: "camion", label: "Camion", type: "number", group: "logistics" },
  {
    key: "produits_lies",
    label: "Produits liés",
    type: "text",
    group: "meta",
    width: "min-w-[150px]",
  },
  {
    key: "nom_complet",
    label: "Nom complet",
    type: "text",
    group: "computed",
    width: "min-w-[200px]",
  },
  {
    key: "description_computed",
    label: "Desc. calculée",
    type: "text",
    group: "computed",
    width: "min-w-[200px]",
  },
  { key: "source_row_hint", label: "Source", type: "readonly", group: "meta" },
  { key: "line_type", label: "Type", type: "readonly", group: "meta" },
];

// ── Editable cell component ───────────────────────────────────────────────

function EditableCell({
  value,
  onChange,
  type = "text",
  className = "",
}: {
  value: string | number | null;
  onChange: (val: string | number | null) => void;
  type?: "text" | "number";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (type === "number") {
      const num = draft === "" ? null : parseFloat(draft);
      if (num !== value) onChange(num);
    } else {
      if (draft !== (value ?? "")) onChange(draft || null);
    }
  }

  if (!editing) {
    return (
      <span
        className={`block cursor-pointer rounded px-1.5 py-0.5 text-xs truncate hover:bg-blue-50 hover:outline hover:outline-1 hover:outline-blue-300 ${className}`}
        onClick={() => {
          setDraft(String(value ?? ""));
          setEditing(true);
        }}
        title={value != null ? String(value) : undefined}
      >
        {value != null && value !== "" ? String(value) : "\u00A0"}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      step={type === "number" ? "0.01" : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={`w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs outline-none ${className}`}
    />
  );
}

// ── Axis tag with reclassify action ───────────────────────────────────────

function AxisTag({
  name,
  type,
  onReclassify,
}: {
  name: string;
  type: "prix" | "style";
  onReclassify: () => void;
}) {
  const isPrix = type === "prix";
  return (
    <span
      className={`group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
        isPrix
          ? "bg-purple-100 text-purple-700"
          : "bg-indigo-100 text-indigo-700"
      }`}
    >
      {name}
      <button
        onClick={onReclassify}
        title={`Déplacer vers ${isPrix ? "style" : "prix"}`}
        className={`ml-0.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100 ${
          isPrix
            ? "text-indigo-500 hover:bg-indigo-200"
            : "text-purple-500 hover:bg-purple-200"
        } flex h-4 w-4 items-center justify-center text-[10px]`}
      >
        {isPrix ? "→S" : "→P"}
      </button>
    </span>
  );
}

// ── Confirmation modal ────────────────────────────────────────────────────

function ConfirmModal({
  corrections,
  destinationFile,
  onConfirm,
  onCancel,
  saving,
}: {
  corrections: ExpandedCorrection[];
  destinationFile: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  function describeCorrection(c: ExpandedCorrection): string {
    switch (c.type) {
      case "edit_variant":
        return `Variante ${c.variant_idx} (${c.product_ref.slice(0, 30)}…) — ${c.field}: ${formatValue(c.old_value)} → ${formatValue(c.new_value)}`;
      case "edit_product":
        return `Produit ${c.product_ref.slice(0, 40)} — ${c.field}: ${formatValue(c.old_value)} → ${formatValue(c.new_value)}`;
      case "reclassify_axis":
        return `Axe "${c.axis_name}" reclassé de ${c.from} → ${c.to} pour ${c.product_ref.slice(0, 40)}`;
      case "move_variant":
        return `Variante #${c.variant_idx} déplacée de ${c.from_product_ref.slice(0, 30)} → ${c.to_product_ref.slice(0, 30)}`;
      case "delete_product":
        return `Produit supprimé: ${c.product_ref}`;
    }
  }

  function formatValue(v: unknown): string {
    if (v == null) return "vide";
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      return entries.map(([k, val]) => `${k}=${val}`).join(", ");
    }
    return String(v);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            Confirmer les corrections
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {corrections.length} modification{corrections.length > 1 ? "s" : ""}{" "}
            en attente
          </p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
          <ul className="space-y-2">
            {corrections.map((c, i) => (
              <li
                key={i}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700"
              >
                <span className="mr-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  {c.type.replace("_", " ")}
                </span>
                {describeCorrection(c)}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <p className="mb-3 text-xs text-gray-500">
            Fichier de destination :{" "}
            <code className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-mono">
              {destinationFile}
            </code>
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Sauvegarde…" : "Confirmer et sauvegarder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  name: string;
  onValidated: () => void;
}

export default function StepReview({ name, onValidated }: Props) {
  const [data, setData] = useState<ExpandedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );
  const [pendingCorrections, setPendingCorrections] = useState<
    ExpandedCorrection[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [correctionsCount, setCorrectionsCount] = useState(0);
  const [search, setSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastSavedFile, setLastSavedFile] = useState<string | null>(null);

  // Corrections destination file name
  const correctionsFileName =
    name.replace(".json", "") + "_expanded_corrections.json";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pipeline/extractions/${encodeURIComponent(name)}/expanded`,
      );
      const json = await res.json();
      if (!json.exists)
        throw new Error(json.error ?? "Fichier expanded introuvable");
      setData(json.data);
      setCorrectionsCount(json.corrections_count ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Local correction helpers (optimistic UI) ────────────────────────────

  function addCorrection(correction: ExpandedCorrection) {
    setPendingCorrections((prev) => [...prev, correction]);
    if (!data) return;
    const clone: ExpandedData = JSON.parse(JSON.stringify(data));
    applyOneCorrection(clone, correction);
    setData(clone);
  }

  function applyOneCorrection(d: ExpandedData, c: ExpandedCorrection) {
    switch (c.type) {
      case "edit_variant": {
        const pVariants = d.variants.filter(
          (v) => v.product_ref === c.product_ref,
        );
        const variant = pVariants[c.variant_idx];
        if (variant) {
          (variant as Record<string, unknown>)[c.field] = c.new_value;
        }
        break;
      }
      case "edit_product": {
        const product = d.products.find((p) => p.ref === c.product_ref);
        if (product) {
          (product as unknown as Record<string, unknown>)[c.field] =
            c.new_value;
        }
        break;
      }
      case "reclassify_axis": {
        const product = d.products.find((p) => p.ref === c.product_ref);
        if (!product) break;
        if (c.from === "prix" && c.to === "style") {
          product.axes_prix = product.axes_prix.filter(
            (a) => a !== c.axis_name,
          );
          product.axes_prix_effectif = product.axes_prix_effectif.filter(
            (a) => a !== c.axis_name,
          );
          if (!product.axes_style.includes(c.axis_name))
            product.axes_style.push(c.axis_name);
          if (!product.axes_style_effectif.includes(c.axis_name))
            product.axes_style_effectif.push(c.axis_name);
        } else {
          product.axes_style = product.axes_style.filter(
            (a) => a !== c.axis_name,
          );
          product.axes_style_effectif = product.axes_style_effectif.filter(
            (a) => a !== c.axis_name,
          );
          if (!product.axes_prix.includes(c.axis_name))
            product.axes_prix.push(c.axis_name);
          if (!product.axes_prix_effectif.includes(c.axis_name))
            product.axes_prix_effectif.push(c.axis_name);
        }
        const variants = d.variants.filter(
          (v) => v.product_ref === c.product_ref,
        );
        for (const v of variants) {
          const value =
            c.from === "prix"
              ? v.attributs_prix_computed[c.axis_name]
              : v.attributs_style_computed[c.axis_name];
          if (value !== undefined) {
            if (c.from === "prix") {
              delete v.attributs_prix_computed[c.axis_name];
              v.attributs_style_computed[c.axis_name] = value;
            } else {
              delete v.attributs_style_computed[c.axis_name];
              v.attributs_prix_computed[c.axis_name] = value;
            }
          }
        }
        break;
      }
      case "move_variant": {
        const variant = d.variants[c.variant_idx];
        if (variant) {
          variant.product_ref = c.to_product_ref;
          const fromProd = d.products.find((p) => p.ref === c.from_product_ref);
          const toProd = d.products.find((p) => p.ref === c.to_product_ref);
          if (fromProd) fromProd.variants_count--;
          if (toProd) toProd.variants_count++;
        }
        break;
      }
      case "delete_product": {
        d.products = d.products.filter((p) => p.ref !== c.product_ref);
        d.variants = d.variants.filter((v) => v.product_ref !== c.product_ref);
        break;
      }
    }
  }

  // ── Save corrections to API ─────────────────────────────────────────────

  async function saveCorrections() {
    if (pendingCorrections.length === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch(
        `/api/admin/pipeline/extractions/${encodeURIComponent(name)}/expanded`,
        {
          method: "PATCH",
          body: JSON.stringify({ corrections: pendingCorrections }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Erreur sauvegarde");
      setCorrectionsCount(json.total_corrections);
      const savedCount = pendingCorrections.length;
      setPendingCorrections([]);
      setShowConfirm(false);
      setLastSavedFile(correctionsFileName);
      setMessage(
        `${savedCount} correction(s) sauvegardées (total : ${json.total_corrections}). Fichier : ${correctionsFileName}`,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle product expansion ────────────────────────────────────────────

  function toggleProduct(ref: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });
  }

  function expandAll() {
    if (!data) return;
    setExpandedProducts(new Set(data.products.map((p) => p.ref)));
  }

  function collapseAll() {
    setExpandedProducts(new Set());
  }

  // ── Filtering ───────────────────────────────────────────────────────────

  function matchesSearch(
    product: ExpandedProduct,
    variants: ExpandedVariant[],
  ): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    if (product.nom_gamme.toLowerCase().includes(q)) return true;
    if (product.ref.toLowerCase().includes(q)) return true;
    if (product.categorie_produit?.toLowerCase().includes(q)) return true;
    return variants.some(
      (v) =>
        v.designation?.toLowerCase().includes(q) ||
        v.reference?.toLowerCase().includes(q),
    );
  }

  // ── Render variant field cell ───────────────────────────────────────────

  function renderVariantCell(
    variant: ExpandedVariant,
    field: FieldDef,
    productRef: string,
    vIdx: number,
  ) {
    const raw = (variant as Record<string, unknown>)[field.key];

    if (field.type === "readonly") {
      return (
        <span
          className="block px-1.5 py-0.5 text-xs text-gray-400 truncate"
          title={raw != null ? String(raw) : undefined}
        >
          {raw != null ? String(raw) : "\u00A0"}
        </span>
      );
    }

    if (field.type === "array") {
      const arr = Array.isArray(raw) ? raw : [];
      return (
        <EditableCell
          value={arr.join(", ")}
          type="text"
          onChange={(val) => {
            const newArr = val
              ? String(val)
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            addCorrection({
              type: "edit_variant",
              product_ref: productRef,
              variant_idx: vIdx,
              field: field.key,
              old_value: arr,
              new_value: newArr,
            });
          }}
        />
      );
    }

    return (
      <EditableCell
        value={raw != null ? (raw as string | number) : null}
        type={field.type}
        onChange={(val) =>
          addCorrection({
            type: "edit_variant",
            product_ref: productRef,
            variant_idx: vIdx,
            field: field.key,
            old_value: raw ?? null,
            new_value: val,
          })
        }
        className={field.type === "number" ? "text-right" : ""}
      />
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-200">
        Chargement des données post-engine…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          onClick={() => void loadData()}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  const totalVariants = data.variants.length;
  const needCheckCount = data.variants.filter((v) => v.need_check).length;

  return (
    <div className="space-y-4">
      {/* Confirm modal */}
      {showConfirm && (
        <ConfirmModal
          corrections={pendingCorrections}
          destinationFile={correctionsFileName}
          onConfirm={() => void saveCorrections()}
          onCancel={() => setShowConfirm(false)}
          saving={saving}
        />
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-6 text-sm">
          <span>
            <strong>{data.products.length}</strong> produits
          </span>
          <span>
            <strong>{totalVariants}</strong> variantes
          </span>
          {needCheckCount > 0 && (
            <span className="text-amber-600">
              <strong>{needCheckCount}</strong> à vérifier
            </span>
          )}
          {correctionsCount > 0 && (
            <span className="text-blue-600">
              {correctionsCount} correction(s) enregistrées
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {pendingCorrections.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded-lg border border-blue-500 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Sauvegarder ({pendingCorrections.length})
            </button>
          )}
          <button
            onClick={() => {
              if (pendingCorrections.length > 0) {
                setShowConfirm(true);
              } else {
                onValidated();
              }
            }}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Terminer la revue
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Rechercher un produit, une réf, une désignation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          onClick={expandAll}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-xs hover:bg-gray-50"
        >
          Tout déplier
        </button>
        <button
          onClick={collapseAll}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-xs hover:bg-gray-50"
        >
          Tout replier
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {message}
          {lastSavedFile && (
            <span className="ml-2 font-mono text-xs text-green-600">
              ({lastSavedFile})
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Products accordion */}
      <div className="space-y-1.5">
        {data.products.map((product) => {
          const productVariants = data.variants.filter(
            (v) => v.product_ref === product.ref,
          );
          if (!matchesSearch(product, productVariants)) return null;

          const isExpanded = expandedProducts.has(product.ref);

          // Collect dynamic attribute keys for this product
          const allPrixKeys = new Set<string>();
          const allStyleKeys = new Set<string>();
          for (const v of productVariants) {
            Object.keys(v.attributs_prix_computed).forEach((k) =>
              allPrixKeys.add(k),
            );
            Object.keys(v.attributs_style_computed).forEach((k) =>
              allStyleKeys.add(k),
            );
          }

          // Build column list: static fields before attrs, dynamic attrs in between, static fields after
          const prixInsertIdx = VARIANT_FIELDS.findIndex(
            (f) => f.key === "matiere",
          );
          const fieldsBefore = VARIANT_FIELDS.slice(0, prixInsertIdx);
          const fieldsAfter = VARIANT_FIELDS.slice(prixInsertIdx);

          return (
            <div
              key={product.ref}
              className="rounded-lg border border-gray-200 bg-white"
            >
              {/* Product header */}
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"
                onClick={() => toggleProduct(product.ref)}
              >
                <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <EditableCell
                      value={product.nom_gamme}
                      onChange={(val) =>
                        addCorrection({
                          type: "edit_product",
                          product_ref: product.ref,
                          field: "nom_gamme",
                          old_value: product.nom_gamme,
                          new_value: val,
                        })
                      }
                      className="text-sm font-semibold"
                    />
                    {product.categorie_produit && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                        {product.categorie_produit}
                      </span>
                    )}
                  </div>
                  {product.description_gamme && (
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">
                      {product.description_gamme}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {productVariants.length} var.
                </span>

                {/* Axes tags */}
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {product.axes_prix.map((axis) => (
                    <AxisTag
                      key={`prix-${axis}`}
                      name={axis}
                      type="prix"
                      onReclassify={() =>
                        addCorrection({
                          type: "reclassify_axis",
                          product_ref: product.ref,
                          axis_name: axis,
                          from: "prix",
                          to: "style",
                        })
                      }
                    />
                  ))}
                  {product.axes_style.map((axis) => (
                    <AxisTag
                      key={`style-${axis}`}
                      name={axis}
                      type="style"
                      onReclassify={() =>
                        addCorrection({
                          type: "reclassify_axis",
                          product_ref: product.ref,
                          axis_name: axis,
                          from: "style",
                          to: "prix",
                        })
                      }
                    />
                  ))}
                  {product.axes_prix.length === 0 &&
                    product.axes_style.length === 0 && (
                      <span className="text-[10px] text-gray-400 italic">
                        aucun axe
                      </span>
                    )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(
                        `Supprimer "${product.nom_gamme}" et ses ${productVariants.length} variantes ?`,
                      )
                    ) {
                      addCorrection({
                        type: "delete_product",
                        product_ref: product.ref,
                      });
                    }
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                  title="Supprimer ce produit"
                >
                  ✕
                </button>
              </div>

              {/* Expanded: full variant table */}
              {isExpanded && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-max min-w-full text-xs">
                    <thead className="border-b bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {fieldsBefore.map((f) => (
                          <th
                            key={f.key}
                            className={`px-2 py-2 text-left font-medium text-gray-500 whitespace-nowrap ${f.width ?? ""} ${f.type === "number" ? "text-right" : ""}`}
                          >
                            {f.label}
                          </th>
                        ))}
                        {[...allPrixKeys].map((k) => (
                          <th
                            key={`prix-${k}`}
                            className="px-2 py-2 text-left font-medium whitespace-nowrap"
                          >
                            <span className="rounded bg-purple-50 px-1 py-0.5 text-purple-600">
                              {k} (prix)
                            </span>
                          </th>
                        ))}
                        {[...allStyleKeys].map((k) => (
                          <th
                            key={`style-${k}`}
                            className="px-2 py-2 text-left font-medium whitespace-nowrap"
                          >
                            <span className="rounded bg-indigo-50 px-1 py-0.5 text-indigo-600">
                              {k} (style)
                            </span>
                          </th>
                        ))}
                        {fieldsAfter.map((f) => (
                          <th
                            key={f.key}
                            className={`px-2 py-2 text-left font-medium text-gray-500 whitespace-nowrap ${f.width ?? ""} ${f.type === "number" ? "text-right" : ""}`}
                          >
                            {f.label}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-medium text-gray-500 whitespace-nowrap">
                          Déplacer
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {productVariants.map((variant, vIdx) => {
                        const globalIdx = data.variants.indexOf(variant);
                        const rowClass = variant.need_check
                          ? "border-b border-amber-100 bg-amber-50/50"
                          : "border-b border-gray-50 hover:bg-gray-50";

                        return (
                          <Fragment key={vIdx}>
                            <tr className={rowClass}>
                              {fieldsBefore.map((f) => (
                                <td
                                  key={f.key}
                                  className={`px-2 py-1 ${f.width ?? ""} ${f.type === "number" ? "text-right" : ""}`}
                                >
                                  {renderVariantCell(
                                    variant,
                                    f,
                                    product.ref,
                                    vIdx,
                                  )}
                                </td>
                              ))}
                              {[...allPrixKeys].map((k) => (
                                <td key={`prix-${k}`} className="px-2 py-1">
                                  <EditableCell
                                    value={
                                      variant.attributs_prix_computed[k] ?? null
                                    }
                                    onChange={(val) => {
                                      const newAttrs = {
                                        ...variant.attributs_prix_computed,
                                      };
                                      if (val == null || val === "") {
                                        delete newAttrs[k];
                                      } else {
                                        newAttrs[k] = String(val);
                                      }
                                      addCorrection({
                                        type: "edit_variant",
                                        product_ref: product.ref,
                                        variant_idx: vIdx,
                                        field: "attributs_prix_computed",
                                        old_value:
                                          variant.attributs_prix_computed,
                                        new_value: newAttrs,
                                      });
                                    }}
                                    className="text-purple-700"
                                  />
                                </td>
                              ))}
                              {[...allStyleKeys].map((k) => (
                                <td key={`style-${k}`} className="px-2 py-1">
                                  <EditableCell
                                    value={
                                      variant.attributs_style_computed[k] ??
                                      null
                                    }
                                    onChange={(val) => {
                                      const newAttrs = {
                                        ...variant.attributs_style_computed,
                                      };
                                      if (val == null || val === "") {
                                        delete newAttrs[k];
                                      } else {
                                        newAttrs[k] = String(val);
                                      }
                                      addCorrection({
                                        type: "edit_variant",
                                        product_ref: product.ref,
                                        variant_idx: vIdx,
                                        field: "attributs_style_computed",
                                        old_value:
                                          variant.attributs_style_computed,
                                        new_value: newAttrs,
                                      });
                                    }}
                                    className="text-indigo-700"
                                  />
                                </td>
                              ))}
                              {fieldsAfter.map((f) => (
                                <td
                                  key={f.key}
                                  className={`px-2 py-1 ${f.width ?? ""} ${f.type === "number" ? "text-right" : ""}`}
                                >
                                  {renderVariantCell(
                                    variant,
                                    f,
                                    product.ref,
                                    vIdx,
                                  )}
                                </td>
                              ))}
                              <td className="px-2 py-1 text-center">
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    addCorrection({
                                      type: "move_variant",
                                      variant_idx: globalIdx,
                                      from_product_ref: product.ref,
                                      to_product_ref: e.target.value,
                                    });
                                    e.target.value = "";
                                  }}
                                  className="w-24 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                >
                                  <option value="">Vers…</option>
                                  {data.products
                                    .filter((p) => p.ref !== product.ref)
                                    .map((p) => (
                                      <option key={p.ref} value={p.ref}>
                                        {p.nom_gamme.slice(0, 30)}
                                      </option>
                                    ))}
                                </select>
                              </td>
                            </tr>
                            {variant.need_check && variant.warning_text && (
                              <tr>
                                <td
                                  colSpan={
                                    fieldsBefore.length +
                                    allPrixKeys.size +
                                    allStyleKeys.size +
                                    fieldsAfter.length +
                                    1
                                  }
                                  className="px-2 pb-1.5 text-[10px] text-amber-600"
                                >
                                  ⚠ {variant.warning_text}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
