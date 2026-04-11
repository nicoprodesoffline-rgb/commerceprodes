"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "lib/admin/fetch";
import { PricingGovernanceCard } from "./pricing-governance";

// ── Variations Workbench (inline) ─────────────────────────────────────────────
interface Variation {
  id: string;
  sku: string;
  name: string;
  regular_price: number | null;
  sale_price: number | null;
  stock_quantity: number | null;
  stock_status: string;
  manage_stock: boolean;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  min_order_quantity: number;
  status: string;
  position: number;
  // Extended (migration 017)
  gtin_upc_ean_isbn?: string | null;
  active_flag?: boolean;
  downloadable?: boolean;
  virtual?: boolean;
  quantity_rules_enabled?: boolean;
  min_quantity?: number;
  max_quantity?: number | null;
  group_of_quantity?: number;
  supplier_ref?: string | null;
  supplier_name?: string | null;
  supplier_purchase_price?: number | null;
  eco_contribution?: number | null;
  variant_attributes?: Array<{
    attribute_name: string;
    attribute_value: string;
    position: number;
  }>;
}

function VariationsWorkbench({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [extendedFields, setExtendedFields] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Variation>>({});
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("activate");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/products/${productId}/variations?page=${page}&limit=${LIMIT}`,
      );
      const data = await res.json();
      setVariations(data.variations ?? []);
      setTotal(data.total ?? 0);
      setExtendedFields(data.extended_fields ?? false);
    } finally {
      setLoading(false);
    }
  }, [productId, page]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function saveVariation(variantId: string) {
    setSaving(true);
    try {
      const res = await adminFetch(
        `/api/admin/products/${productId}/variations/${variantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editDraft),
        },
      );
      if (res.ok) {
        setEditingId(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyBulk() {
    if (selected.size === 0) return;
    setBulkApplying(true);
    try {
      await adminFetch(`/api/admin/products/${productId}/variations/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_ids: [...selected],
          action: bulkAction,
          value: bulkValue || undefined,
        }),
      });
      setSelected(new Set());
      load();
    } finally {
      setBulkApplying(false);
    }
  }

  async function generateVariations() {
    if (!confirm("Générer les variations manquantes ?")) return;
    const res = await adminFetch(
      `/api/admin/products/${productId}/variations/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const data = await res.json();
    alert(`${data.created} variation(s) créée(s), ${data.skipped} ignorée(s)`);
    load();
  }

  const BULK_ACTIONS = [
    { value: "activate", label: "Activer" },
    { value: "deactivate", label: "Désactiver" },
    { value: "archive", label: "Archiver" },
    {
      value: "set_stock_status",
      label: "Changer stock",
      needsValue: true,
      valuePlaceholder: "instock/outofstock",
    },
    {
      value: "set_price",
      label: "Fixer prix",
      needsValue: true,
      valuePlaceholder: "Ex: 49.90",
    },
    {
      value: "price_discount",
      label: "Remise %",
      needsValue: true,
      valuePlaceholder: "Ex: 10",
    },
    {
      value: "price_increase",
      label: "Hausse %",
      needsValue: true,
      valuePlaceholder: "Ex: 5",
    },
    ...(extendedFields
      ? [
          {
            value: "set_min_quantity",
            label: "Min qté",
            needsValue: true,
            valuePlaceholder: "Ex: 5",
          },
          {
            value: "set_max_quantity",
            label: "Max qté",
            needsValue: true,
            valuePlaceholder: "Ex: 100",
          },
          {
            value: "set_group_of",
            label: "Par lots de",
            needsValue: true,
            valuePlaceholder: "Ex: 10",
          },
          {
            value: "set_eco_contribution",
            label: "Éco-participation",
            needsValue: true,
            valuePlaceholder: "Ex: 0.40",
          },
          {
            value: "set_supplier_ref",
            label: "Ref fournisseur",
            needsValue: true,
            valuePlaceholder: "Ref",
          },
        ]
      : []),
  ];

  const currentBulkDef = BULK_ACTIONS.find((a) => a.value === bulkAction);

  return (
    <section className="rounded-lg border border-indigo-200 bg-white">
      <div className="flex items-center justify-between border-b border-indigo-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">
            ⚙️ Variations Workbench
          </h2>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            {total} variation{total !== 1 ? "s" : ""}
          </span>
          {extendedFields && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
              +champs V2
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          {open ? "Réduire ▲" : "Ouvrir ▼"}
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={generateVariations}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              + Générer variations
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              {loading ? "…" : "↺ Actualiser"}
            </button>
            {/* Bulk actions */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-gray-500">
                {selected.size > 0 ? `${selected.size} sélect.` : ""}
              </span>
              <select
                value={bulkAction}
                onChange={(e) => {
                  setBulkAction(e.target.value);
                  setBulkValue("");
                }}
                className="rounded border border-gray-200 px-2 py-1 text-xs"
              >
                {BULK_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {currentBulkDef?.needsValue && (
                <input
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder={currentBulkDef.valuePlaceholder}
                  className="w-24 rounded border border-gray-200 px-2 py-1 text-xs"
                />
              )}
              <button
                onClick={applyBulk}
                disabled={selected.size === 0 || bulkApplying}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkApplying ? "…" : "Appliquer"}
              </button>
            </div>
          </div>

          {/* Table */}
          {loading && <p className="text-xs text-gray-400">Chargement…</p>}

          <div className="overflow-x-auto rounded border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2 text-left w-6">
                    <input
                      type="checkbox"
                      checked={
                        selected.size === variations.length &&
                        variations.length > 0
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(variations.map((v) => v.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-2 py-2 text-left">SKU</th>
                  <th className="px-2 py-2 text-left">Nom</th>
                  <th className="px-2 py-2 text-right">Prix</th>
                  <th className="px-2 py-2 text-center">Stock</th>
                  {extendedFields && (
                    <th className="px-2 py-2 text-center">Qté min</th>
                  )}
                  {extendedFields && (
                    <th className="px-2 py-2 text-center">Lot</th>
                  )}
                  {extendedFields && (
                    <th className="px-2 py-2 text-left">Fournisseur</th>
                  )}
                  <th className="px-2 py-2 text-center">Statut</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {variations.map((v) => {
                  const isEditing = editingId === v.id;
                  const draft = isEditing ? editDraft : {};
                  return (
                    <tr
                      key={v.id}
                      className={`border-t border-gray-50 ${isEditing ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(v.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const n = new Set(prev);
                              n.has(v.id) ? n.delete(v.id) : n.add(v.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-gray-600">
                        {isEditing ? (
                          <input
                            value={(draft.sku ?? v.sku) as string}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                sku: e.target.value,
                              }))
                            }
                            className="w-28 rounded border border-indigo-300 px-1 py-0.5 text-xs"
                          />
                        ) : (
                          v.sku
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-800 max-w-[160px] truncate">
                        {isEditing ? (
                          <input
                            value={(draft.name ?? v.name) as string}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                name: e.target.value,
                              }))
                            }
                            className="w-36 rounded border border-indigo-300 px-1 py-0.5 text-xs"
                          />
                        ) : (
                          v.name
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={
                              (draft.regular_price ??
                                v.regular_price ??
                                "") as number
                            }
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                regular_price: Number(e.target.value),
                              }))
                            }
                            className="w-20 rounded border border-indigo-300 px-1 py-0.5 text-xs text-right"
                          />
                        ) : v.regular_price != null ? (
                          `${v.regular_price} €`
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {isEditing ? (
                          <select
                            value={
                              (draft.stock_status ?? v.stock_status) as string
                            }
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                stock_status: e.target.value,
                              }))
                            }
                            className="rounded border border-indigo-300 px-1 py-0.5 text-xs"
                          >
                            <option value="instock">En stock</option>
                            <option value="outofstock">Épuisé</option>
                            <option value="onbackorder">Commande</option>
                          </select>
                        ) : (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.stock_status === "instock" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                          >
                            {v.stock_status === "instock"
                              ? "stock"
                              : v.stock_status === "outofstock"
                                ? "épuisé"
                                : "commande"}
                          </span>
                        )}
                      </td>
                      {extendedFields && (
                        <td className="px-2 py-2 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              value={
                                (draft.min_quantity ??
                                  v.min_quantity ??
                                  1) as number
                              }
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  min_quantity: Number(e.target.value),
                                }))
                              }
                              className="w-14 rounded border border-indigo-300 px-1 py-0.5 text-xs text-center"
                            />
                          ) : (
                            (v.min_quantity ?? 1)
                          )}
                        </td>
                      )}
                      {extendedFields && (
                        <td className="px-2 py-2 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              value={
                                (draft.group_of_quantity ??
                                  v.group_of_quantity ??
                                  1) as number
                              }
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  group_of_quantity: Number(e.target.value),
                                }))
                              }
                              className="w-14 rounded border border-indigo-300 px-1 py-0.5 text-xs text-center"
                            />
                          ) : (
                            (v.group_of_quantity ?? 1)
                          )}
                        </td>
                      )}
                      {extendedFields && (
                        <td className="px-2 py-2 text-gray-500 max-w-[100px] truncate">
                          {isEditing ? (
                            <input
                              value={
                                (draft.supplier_ref ??
                                  v.supplier_ref ??
                                  "") as string
                              }
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  supplier_ref: e.target.value,
                                }))
                              }
                              placeholder="Réf."
                              className="w-20 rounded border border-indigo-300 px-1 py-0.5 text-xs"
                            />
                          ) : (
                            (v.supplier_ref ?? "—")
                          )}
                        </td>
                      )}
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${v.status === "publish" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveVariation(v.id)}
                              disabled={saving}
                              className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] text-white disabled:opacity-50"
                            >
                              {saving ? "…" : "OK"}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(v.id);
                              setEditDraft({});
                            }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800"
                          >
                            Éditer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
              >
                ◀
              </button>
              <span>
                Page {page} / {Math.ceil(total / LIMIT)}
              </span>
              <button
                disabled={page >= Math.ceil(total / LIMIT)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
              >
                ▶
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  type: string | null;
  status: string;
  family_role: string | null;
  parent_sku: string | null;
  parent_family_id: string | null;
  short_description: string | null;
  description: string | null;
  regular_price: number | null;
  sale_price: number | null;
  sale_price_start: string | null;
  sale_price_end: string | null;
  stock_quantity: number | null;
  stock_status: string | null;
  manage_stock: boolean | null;
  low_stock_threshold: number | null;
  tax_status: string | null;
  tax_class: string | null;
  supplier_ref: string | null;
  supplier_code: string | null;
  supplier_price: number | null;
  eco_contribution: number | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  backorders_allowed: boolean | null;
  sold_individually: boolean | null;
  pbq_enabled: boolean | null;
  pbq_pricing_type: string | null;
  pbq_min_quantity: number | null;
  pbq_max_quantity: number | null;
  default_attribute_values: Record<string, string> | null;
  tags: string[];
  featured_image_url: string | null; // computed from product_images join (read-only)
  seo_title: string | null;
  seo_description: string | null;
  family?: {
    id: string;
    name: string;
    strategy: string;
    children_count: number;
  } | null;
}

function seoScore(p: Partial<ProductDetail>): number {
  let score = 0;
  if (p.name && p.name.length >= 30 && p.name.length <= 70) score += 25;
  if (p.short_description && p.short_description.length >= 80) score += 25;
  if (p.sku) score += 25;
  if (p.regular_price && p.regular_price > 0) score += 25;
  return score;
}

function SeoVoyant({ score }: { score: number }) {
  const { color, label } =
    score >= 90
      ? { color: "text-green-600 bg-green-50", label: "Excellent" }
      : score >= 70
        ? { color: "text-yellow-600 bg-yellow-50", label: "Bon" }
        : score >= 40
          ? { color: "text-orange-600 bg-orange-50", label: "Moyen" }
          : { color: "text-red-600 bg-red-50", label: "Insuffisant" };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      ● {score}/100 — {label}
    </span>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeDescTab, setActiveDescTab] = useState<"short" | "long">("short");

  useEffect(() => {
    if (!id) return;
    adminFetch(`/api/admin/products/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleGenerateAI = async () => {
    if (!product) return;
    setAiLoading(true);
    try {
      const res = await adminFetch("/api/admin/ia/generate-descriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId: id }),
      });
      const data = await res.json();
      if (data.products?.[0]?.description) {
        setProduct((prev) =>
          prev
            ? { ...prev, short_description: data.products[0].description }
            : prev,
        );
      }
    } catch {
      /* ignore */
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          type: product.type,
          status: product.status,
          family_role: product.family_role,
          parent_sku: product.parent_sku,
          parent_family_id: product.parent_family_id,
          short_description: product.short_description,
          description: product.description,
          regular_price: product.regular_price,
          sale_price: product.sale_price,
          sale_price_start: product.sale_price_start,
          sale_price_end: product.sale_price_end,
          stock_quantity: product.stock_quantity,
          stock_status: product.stock_status,
          manage_stock: product.manage_stock,
          low_stock_threshold: product.low_stock_threshold,
          tax_status: product.tax_status,
          tax_class: product.tax_class,
          supplier_ref: product.supplier_ref,
          supplier_code: product.supplier_code,
          supplier_price: product.supplier_price,
          eco_contribution: product.eco_contribution,
          weight: product.weight,
          length: product.length,
          width: product.width,
          height: product.height,
          backorders_allowed: product.backorders_allowed,
          sold_individually: product.sold_individually,
          pbq_enabled: product.pbq_enabled,
          pbq_pricing_type: product.pbq_pricing_type,
          pbq_min_quantity: product.pbq_min_quantity,
          pbq_max_quantity: product.pbq_max_quantity,
          default_attribute_values: product.default_attribute_values,
          tags: product.tags,
          seo_title: product.seo_title,
          seo_description: product.seo_description,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.product) {
          setProduct(data.product);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, [product, id]);

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Chargement…</div>;
  }

  if (!product) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Produit introuvable.</p>
        <Link
          href="/admin/catalogue"
          className="mt-4 text-sm text-[#cc1818] underline"
        >
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  const score = seoScore(product);
  const seoCriterias = [
    !product.name || product.name.length < 30 || product.name.length > 70
      ? "Titre entre 30 et 70 caractères"
      : null,
    !product.short_description || product.short_description.length < 80
      ? "Description ≥ 80 caractères"
      : null,
    !product.sku ? "SKU manquant" : null,
    !product.regular_price ? "Prix non défini" : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <Link
            href="/admin/catalogue"
            className="mb-1 block text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Retour au catalogue
          </Link>
          <h1 className="text-xl font-bold text-gray-900 line-clamp-1">
            {product.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/product/${product.slug}`}
            target="_blank"
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Voir la fiche →
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${
              saved ? "bg-green-600" : "bg-[#cc1818] hover:bg-[#aa1414]"
            }`}
          >
            {saving
              ? "Enregistrement…"
              : saved
                ? "✓ Enregistré"
                : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Colonne principale (70%) ── */}
        <div className="flex-1 space-y-5">
          {/* Informations générales */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Informations générales
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Titre *
                  <span
                    className={`ml-2 text-xs ${product.name.length > 70 ? "text-red-600" : "text-gray-400"}`}
                  >
                    {product.name.length}/70
                  </span>
                </label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) =>
                    setProduct({ ...product, name: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Handle / Slug
                </label>
                <input
                  type="text"
                  value={product.slug}
                  onChange={(e) =>
                    setProduct({ ...product, slug: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  SKU
                </label>
                <input
                  type="text"
                  value={product.sku ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, sku: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Type produit
                </label>
                <select
                  value={product.type ?? "simple"}
                  onChange={(e) =>
                    setProduct({ ...product, type: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="simple">Simple</option>
                  <option value="variable">Variable</option>
                  <option value="external">Externe</option>
                  <option value="grouped">Groupé</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Statut
                </label>
                <select
                  value={product.status}
                  onChange={(e) =>
                    setProduct({ ...product, status: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="publish">Publié</option>
                  <option value="draft">Brouillon</option>
                  <option value="private">Privé</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Rôle famille
                </label>
                <select
                  value={product.family_role ?? "standalone"}
                  onChange={(e) =>
                    setProduct({ ...product, family_role: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="standalone">Standalone</option>
                  <option value="parent">Parent</option>
                  <option value="child">Child</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  parent_sku
                </label>
                <input
                  type="text"
                  value={product.parent_sku ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, parent_sku: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Éco-participation (€/unité)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.eco_contribution ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      eco_contribution: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Tags (séparés par virgule)
                </label>
                <input
                  type="text"
                  value={
                    Array.isArray(product.tags) ? product.tags.join(", ") : ""
                  }
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      tags: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Description */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">
                  Description
                </h2>
                <button
                  onClick={handleGenerateAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  ✨ {aiLoading ? "Génération…" : "Générer avec IA"}
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="mb-3 flex border-b border-gray-200">
                {(["short", "long"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveDescTab(tab)}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      activeDescTab === tab
                        ? "border-b-2 border-[#cc1818] text-[#cc1818]"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {tab === "short"
                      ? "Description courte"
                      : "Description longue"}
                  </button>
                ))}
              </div>
              {activeDescTab === "short" ? (
                <div>
                  <textarea
                    rows={4}
                    maxLength={300}
                    value={product.short_description ?? ""}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        short_description: e.target.value,
                      })
                    }
                    className={inputClass}
                    placeholder="Description courte (max 300 caractères)"
                  />
                  <p className="mt-1 text-right text-xs text-gray-400">
                    {(product.short_description ?? "").length}/300
                  </p>
                </div>
              ) : (
                <textarea
                  rows={8}
                  value={product.description ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, description: e.target.value })
                  }
                  className={inputClass}
                  placeholder="Description longue (HTML supporté)"
                />
              )}
            </div>
          </section>

          {/* Tarification pilotée (source unique pour normal/promo/lots) */}
          <PricingGovernanceCard productId={id} />

          {/* Stock / commercial */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Stock, fiscalité et fournisseur
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Stock quantity
                </label>
                <input
                  type="number"
                  value={product.stock_quantity ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      stock_quantity: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Stock status
                </label>
                <select
                  value={product.stock_status ?? "instock"}
                  onChange={(e) =>
                    setProduct({ ...product, stock_status: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="instock">instock</option>
                  <option value="outofstock">outofstock</option>
                  <option value="onbackorder">onbackorder</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Low stock threshold
                </label>
                <input
                  type="number"
                  value={product.low_stock_threshold ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      low_stock_threshold: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(product.manage_stock)}
                    onChange={(e) =>
                      setProduct({ ...product, manage_stock: e.target.checked })
                    }
                  />
                  Manage stock
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(product.backorders_allowed)}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        backorders_allowed: e.target.checked,
                      })
                    }
                  />
                  Backorders
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(product.sold_individually)}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        sold_individually: e.target.checked,
                      })
                    }
                  />
                  Sold individually
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(product.pbq_enabled)}
                    onChange={(e) =>
                      setProduct({ ...product, pbq_enabled: e.target.checked })
                    }
                  />
                  PBQ enabled
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Tax status
                </label>
                <select
                  value={product.tax_status ?? "taxable"}
                  onChange={(e) =>
                    setProduct({ ...product, tax_status: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="taxable">taxable</option>
                  <option value="shipping">shipping</option>
                  <option value="none">none</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Tax class
                </label>
                <input
                  type="text"
                  value={product.tax_class ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, tax_class: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Supplier ref
                </label>
                <input
                  type="text"
                  value={product.supplier_ref ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, supplier_ref: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Supplier code
                </label>
                <input
                  type="text"
                  value={product.supplier_code ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, supplier_code: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Supplier price (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.supplier_price ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      supplier_price: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Dimensions / rules */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Dimensions et règles quantité
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Poids (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.weight ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      weight: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Longueur (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.length ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      length: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Largeur (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.width ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      width: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Hauteur (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={product.height ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      height: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  PBQ pricing type
                </label>
                <input
                  type="text"
                  value={product.pbq_pricing_type ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, pbq_pricing_type: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  PBQ min quantity
                </label>
                <input
                  type="number"
                  value={product.pbq_min_quantity ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      pbq_min_quantity: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  PBQ max quantity
                </label>
                <input
                  type="number"
                  value={product.pbq_max_quantity ?? ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      pbq_max_quantity: parseNullableNumber(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  default_attribute_values (JSON)
                </label>
                <textarea
                  rows={3}
                  value={JSON.stringify(
                    product.default_attribute_values ?? {},
                    null,
                    2,
                  )}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      if (
                        parsed &&
                        typeof parsed === "object" &&
                        !Array.isArray(parsed)
                      ) {
                        setProduct({
                          ...product,
                          default_attribute_values: parsed as Record<
                            string,
                            string
                          >,
                        });
                      }
                    } catch {
                      // keep user draft text unmanaged until valid JSON
                    }
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Colonne latérale (30%) ── */}
        <div className="w-full space-y-4 lg:w-72 lg:flex-none">
          {/* Image */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Image principale
              </h2>
            </div>
            <div className="p-5">
              {product.featured_image_url && (
                <div className="mb-3 aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <Image
                    src={product.featured_image_url}
                    alt={product.name}
                    width={200}
                    height={200}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <input
                type="url"
                value={product.featured_image_url ?? ""}
                onChange={(e) =>
                  setProduct({ ...product, featured_image_url: e.target.value })
                }
                className={inputClass}
                placeholder="https://…"
              />
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Structure famille
              </h2>
            </div>
            <div className="space-y-2 p-5 text-xs text-gray-700">
              <p>
                <span className="font-medium">Rôle :</span>{" "}
                {product.family_role ?? "standalone"}
              </p>
              <p>
                <span className="font-medium">parent_sku :</span>{" "}
                {product.parent_sku || "—"}
              </p>
              <p>
                <span className="font-medium">parent_family_id :</span>{" "}
                {product.parent_family_id || "—"}
              </p>
              {product.family ? (
                <p className="rounded bg-green-50 px-2 py-1 text-green-700">
                  Famille active: {product.family.name} (
                  {product.family.children_count} fille(s))
                </p>
              ) : (
                <p className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                  Aucune famille DB active. Les variantes restent accessibles
                  via le workbench ci-dessous.
                </p>
              )}
            </div>
          </section>

          {/* Variations Workbench */}
          <VariationsWorkbench productId={id} />

          {/* SEO */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">SEO</h2>
                <SeoVoyant score={score} />
              </div>
            </div>
            <div className="space-y-3 p-5">
              {seoCriterias.length > 0 && (
                <ul className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  {seoCriterias.map((c) => (
                    <li key={c}>⚠ {c}</li>
                  ))}
                </ul>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Titre SEO
                  <span
                    className={`ml-2 text-xs ${(product.seo_title ?? "").length > 70 ? "text-red-600" : "text-gray-400"}`}
                  >
                    {(product.seo_title ?? "").length}/70
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={70}
                  value={product.seo_title ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, seo_title: e.target.value })
                  }
                  className={inputClass}
                  placeholder={product.name}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Description meta
                  <span
                    className={`ml-2 text-xs ${(product.seo_description ?? "").length > 155 ? "text-red-600" : "text-gray-400"}`}
                  >
                    {(product.seo_description ?? "").length}/155
                  </span>
                </label>
                <textarea
                  maxLength={155}
                  rows={3}
                  value={product.seo_description ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, seo_description: e.target.value })
                  }
                  className={inputClass}
                  placeholder={product.short_description ?? ""}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
