"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "lib/admin/fetch";

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  regular_price: number;
  status: string;
  featured_image_url: string | null;
  categories: { id: string; name: string } | null;
  short_description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
}

interface Category {
  id: string;
  name: string;
}

const PAGE_SIZE = 100;

const BULK_FIELD_OPTIONS = [
  { id: "regular_price", label: "Prix HT (€)", type: "number" },
  { id: "status", label: "Statut", type: "select" },
  { id: "short_description", label: "Desc. courte", type: "text" },
  { id: "seo_title", label: "SEO title", type: "text" },
  { id: "seo_description", label: "SEO description", type: "text" },
];

const STATUS_OPTIONS = [
  { id: "publish", label: "Publié" },
  { id: "draft", label: "Brouillon" },
];

function seoScore(p: AdminProduct): number {
  let score = 0;
  if (p.name && p.name.length >= 30 && p.name.length <= 70) score += 20;
  if (p.sku) score += 20;
  if (p.featured_image_url) score += 20;
  if (p.regular_price > 0) score += 20;
  if (p.categories) score += 20;
  return score;
}

function SeoVoyant({ score }: { score: number }) {
  const color =
    score >= 90 ? "text-green-600" :
    score >= 70 ? "text-yellow-500" :
    score >= 40 ? "text-orange-500" : "text-red-600";
  return (
    <span className={`font-mono text-xs font-semibold ${color}`} title={`Score SEO : ${score}/100`}>
      ● {score}
    </span>
  );
}

function EditableCell({
  value,
  type = "text",
  dirty = false,
  onSave,
}: {
  value: string | number;
  type?: "text" | "number";
  dirty?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const commit = async () => {
    if (draft === String(value)) { setEditing(false); return; }
    setSaving(true); setError(false);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { setError(true); setTimeout(() => setError(false), 2000); }
    finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-full rounded border border-blue-400 px-1 py-0.5 text-xs outline-none ring-1 ring-blue-400"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => { setDraft(String(value)); setEditing(true); }}
      className={`block cursor-text rounded px-1 py-0.5 text-xs transition-colors hover:bg-gray-100 ${
        saving ? "bg-blue-50 text-blue-700" : ""
      } ${saved ? "bg-green-50 text-green-700" : ""} ${error ? "bg-red-50 text-red-700" : ""} ${
        dirty && !saving && !saved ? "bg-amber-50 ring-1 ring-amber-300" : ""
      }`}
      title="Double-clic pour éditer"
    >
      {value || <span className="text-gray-300">—</span>}
      {dirty && !saving && !saved && <span className="ml-1 text-amber-500">●</span>}
    </span>
  );
}

function SelectCell({
  value,
  options,
  dirty = false,
  onSave,
}: {
  value: string;
  options: { id: string; label: string }[];
  dirty?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSaving(true);
    try { await onSave(e.target.value); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className={`w-full rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
        saved ? "border-green-400 bg-green-50" :
        dirty ? "border-amber-400 bg-amber-50" : "border-gray-200"
      } disabled:opacity-50`}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

// ── CSV Export ─────────────────────────────────────────────────
function exportToCsv(products: AdminProduct[], dirtyRows: Map<string, Partial<AdminProduct>>) {
  const rows: AdminProduct[] = products.map((p) => ({
    ...p,
    ...(dirtyRows.get(p.id) ?? {}),
  }));
  const headers = ["id", "sku", "name", "regular_price", "status", "short_description", "seo_title", "seo_description"];
  const csvContent = [
    headers.join(";"),
    ...rows.map((p) =>
      headers.map((h) => {
        const v = (p as unknown as Record<string, unknown>)[h];
        const s = v == null ? "" : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(";"),
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `catalogue-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────
export default function CataloguePage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk status action
  const [bulkAction, setBulkAction] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Bulk field set (V2)
  const [bulkField, setBulkField] = useState("");
  const [bulkFieldValue, setBulkFieldValue] = useState("");
  const [bulkFieldLoading, setBulkFieldLoading] = useState(false);
  const [bulkFieldApplied, setBulkFieldApplied] = useState(0);

  // Dirty rows tracking
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<AdminProduct>>>(new Map());
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllResult, setSaveAllResult] = useState<{ ok: number; fail: number } | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), search, status: statusFilter, limit: String(PAGE_SIZE) });
      const res = await adminFetch(`/api/admin/products-list?${params}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    adminFetch("/api/admin/ia/categories-list").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, []);

  // Individual persist (called from EditableCell/SelectCell)
  const patchProduct = useCallback(async (id: string, field: string, value: string | number) => {
    const res = await adminFetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error("Erreur");
    const data = await res.json();
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.product } : p)));
    setDirtyRows((prev) => { const next = new Map(prev); next.delete(id); return next; });
  }, []);

  // Mark local change (dirty tracking)
  const setLocalChange = useCallback((id: string, field: string, value: string | number) => {
    setDirtyRows((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {};
      next.set(id, { ...existing, [field]: value });
      return next;
    });
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }, []);

  // Save all dirty rows
  const saveAllDirty = useCallback(async () => {
    if (dirtyRows.size === 0) return;
    setSaveAllLoading(true);
    let ok = 0, fail = 0;
    for (const [id, changes] of dirtyRows.entries()) {
      try {
        const res = await adminFetch(`/api/admin/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (res.ok) { ok++; setDirtyRows((prev) => { const next = new Map(prev); next.delete(id); return next; }); }
        else fail++;
      } catch { fail++; }
    }
    setSaveAllLoading(false);
    setSaveAllResult({ ok, fail });
    setTimeout(() => setSaveAllResult(null), 3000);
  }, [dirtyRows]);

  // Bulk action (publish/draft/price_discount/etc.)
  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await adminFetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: bulkAction, value: bulkValue || undefined }),
      });
      if (res.ok) { await fetchProducts(); setSelected(new Set()); setBulkAction(""); setBulkValue(""); }
    } catch { /* ignore */ }
    finally { setBulkLoading(false); }
  };

  // Bulk field set: apply same value to all selected rows (locally)
  const handleBulkFieldSet = async () => {
    if (!bulkField || bulkFieldValue === "" || selected.size === 0) return;
    setBulkFieldLoading(true);
    const fieldDef = BULK_FIELD_OPTIONS.find((f) => f.id === bulkField);
    const typedValue = fieldDef?.type === "number" ? parseFloat(bulkFieldValue) : bulkFieldValue;
    let count = 0;
    for (const id of selected) {
      setLocalChange(id, bulkField, typedValue);
      count++;
    }
    setBulkFieldApplied(count);
    setTimeout(() => setBulkFieldApplied(0), 2000);
    setBulkFieldLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleAll = () => {
    setSelected(selected.size === products.length ? new Set() : new Set(products.map((p) => p.id)));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const dirtyCount = dirtyRows.size;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vue Excel — Catalogue</h1>
          {dirtyCount > 0 && (
            <p className="mt-0.5 text-xs text-amber-600 font-medium">
              ● {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} non sauvegardée{dirtyCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {dirtyCount > 0 && (
            <button
              onClick={saveAllDirty}
              disabled={saveAllLoading}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {saveAllLoading ? "Sauvegarde…" : `💾 Sauvegarder (${dirtyCount})`}
            </button>
          )}
          {saveAllResult && (
            <span className={`self-center text-xs font-medium ${saveAllResult.fail > 0 ? "text-red-600" : "text-green-600"}`}>
              {saveAllResult.ok} OK{saveAllResult.fail > 0 ? ` / ${saveAllResult.fail} erreur` : ""}
            </span>
          )}
          <Link href="/admin/produits" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            📋 Vue liste
          </Link>
          <button
            onClick={() => exportToCsv(products, dirtyRows)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ⬇️ Export CSV (vue)
          </button>
          <a href="/api/admin/export-products" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            ⬇️ Export total
          </a>
        </div>
      </div>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818] w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
        >
          <option value="all">Tous statuts</option>
          <option value="publish">Publié</option>
          <option value="draft">Brouillon</option>
        </select>
        <span className="self-center text-xs text-gray-500">
          {total} produit{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Barre actions groupées */}
      {selected.size > 0 && (
        <div className="mb-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-blue-800">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <button onClick={toggleAll} className="text-xs text-blue-600 underline">
              {selected.size === products.length ? "Désélectionner tout" : "Tout sélectionner"}
            </button>
            {/* Actions status/prix groupées */}
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Actions statut/prix ▼</option>
              <option value="publish">Publier</option>
              <option value="draft">Mettre en brouillon</option>
              <option value="price_discount">Remise % →</option>
              <option value="price_increase">Hausse % →</option>
              <option value="change_category">Changer catégorie →</option>
            </select>
            {(bulkAction === "price_discount" || bulkAction === "price_increase") && (
              <input type="number" min={1} max={100} placeholder="%" value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none" />
            )}
            {bulkAction === "change_category" && (
              <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none">
                <option value="">Choisir…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {bulkAction && (
              <button onClick={handleBulkAction} disabled={bulkLoading || !bulkAction}
                className="rounded bg-[#cc1818] px-3 py-1 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-50">
                {bulkLoading ? "…" : "Appliquer"}
              </button>
            )}
          </div>

          {/* Bulk field set (V2) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 pt-2">
            <span className="text-xs font-medium text-blue-700">Modifier champ :</span>
            <select
              value={bulkField}
              onChange={(e) => { setBulkField(e.target.value); setBulkFieldValue(""); }}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Choisir un champ…</option>
              {BULK_FIELD_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {bulkField && (() => {
              const fieldDef = BULK_FIELD_OPTIONS.find((f) => f.id === bulkField);
              if (!fieldDef) return null;
              if (fieldDef.type === "select") {
                return (
                  <select value={bulkFieldValue} onChange={(e) => setBulkFieldValue(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none">
                    <option value="">Valeur…</option>
                    {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                );
              }
              return (
                <input type={fieldDef.type} value={bulkFieldValue} onChange={(e) => setBulkFieldValue(e.target.value)}
                  placeholder={`Valeur pour ${fieldDef.label}…`}
                  className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none w-48" />
              );
            })()}
            {bulkField && (
              <button
                onClick={handleBulkFieldSet}
                disabled={bulkFieldLoading || !bulkFieldValue}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {bulkFieldApplied > 0 ? `✓ ${bulkFieldApplied} modifié(s)` : "Appliquer (local)"}
              </button>
            )}
            {dirtyCount > 0 && (
              <button
                onClick={() => { setDirtyRows(new Map()); fetchProducts(); }}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                Annuler modifications locales
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={selected.size === products.length && products.length > 0}
                  onChange={toggleAll} className="accent-[#cc1818]" />
              </th>
              <th className="w-12 px-3 py-3">Image</th>
              <th className="px-3 py-3 text-left">Titre</th>
              <th className="w-28 px-3 py-3 text-left">SKU</th>
              <th className="w-28 px-3 py-3 text-right">Prix HT</th>
              <th className="w-24 px-3 py-3 text-left">Statut</th>
              <th className="w-24 px-3 py-3 text-center">SEO</th>
              <th className="w-28 px-3 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">Chargement…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">Aucun produit</td></tr>
            ) : (
              products.map((p) => {
                const rowDirty = dirtyRows.has(p.id);
                const dirty = dirtyRows.get(p.id) ?? {};
                return (
                  <tr key={p.id}
                    className={`hover:bg-gray-50 transition-colors ${selected.has(p.id) ? "bg-blue-50" : ""} ${rowDirty ? "border-l-2 border-amber-400" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-[#cc1818]" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-10 w-10 overflow-hidden rounded border border-gray-100 bg-gray-50">
                        {p.featured_image_url ? (
                          <Image src={p.featured_image_url} alt={p.name} width={40} height={40} className="h-full w-full object-contain" />
                        ) : (
                          <div className="h-full w-full bg-gray-100" />
                        )}
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-2">
                      <EditableCell value={p.name} dirty={"name" in dirty}
                        onSave={(v) => patchProduct(p.id, "name", v)} />
                    </td>
                    <td className="px-3 py-2">
                      <EditableCell value={p.sku ?? ""} dirty={"sku" in dirty}
                        onSave={(v) => patchProduct(p.id, "sku", v)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditableCell value={p.regular_price} type="number" dirty={"regular_price" in dirty}
                        onSave={(v) => patchProduct(p.id, "regular_price", parseFloat(v))} />
                    </td>
                    <td className="px-3 py-2">
                      <SelectCell value={p.status} options={STATUS_OPTIONS} dirty={"status" in dirty}
                        onSave={(v) => patchProduct(p.id, "status", v)} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SeoVoyant score={seoScore(p)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <Link href={`/product/${p.slug}`} target="_blank" className="text-gray-400 hover:text-[#cc1818] transition-colors" title="Voir">👁️</Link>
                        <Link href={`/admin/produits/${p.id}`} className="text-gray-400 hover:text-[#cc1818] transition-colors" title="Éditer">✏️</Link>
                        <a href={`/api/product-pdf/${p.slug}`} target="_blank" className="text-gray-400 hover:text-[#cc1818] transition-colors" title="PDF">📄</a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Page {page + 1} sur {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors">
              ← Précédent
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors">
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
