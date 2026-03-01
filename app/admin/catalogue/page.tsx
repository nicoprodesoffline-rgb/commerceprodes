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
}

interface Category {
  id: string;
  name: string;
}

interface ProductsListApiItem {
  id: string;
  title: string;
  handle: string;
  sku: string | null;
  regular_price: number | null;
  status: string;
  featured_image_url: string | null;
  categories: string | null;
}

const PAGE_SIZE = 100;

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
    score >= 90
      ? "text-green-600"
      : score >= 70
        ? "text-yellow-500"
        : score >= 40
          ? "text-orange-500"
          : "text-red-600";
  return (
    <span className={`font-mono text-xs font-semibold ${color}`} title={`Score SEO : ${score}/100`}>
      ● {score}
    </span>
  );
}

function EditableCell({
  value,
  type = "text",
  onSave,
}: {
  value: string | number;
  type?: "text" | "number";
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = async () => {
    if (draft === String(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 2000);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border border-[#cc1818] bg-white px-1.5 py-0.5 text-xs focus:outline-none"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`block cursor-text rounded px-1 py-0.5 text-xs transition-colors hover:bg-gray-100 ${
        saving ? "bg-blue-50 text-blue-700" : ""
      } ${saved ? "bg-green-50 text-green-700" : ""} ${error ? "bg-red-50 text-red-700" : ""}`}
      title="Double-clic pour éditer"
    >
      {value || <span className="text-gray-300">—</span>}
    </span>
  );
}

function SelectCell({
  value,
  options,
  onSave,
}: {
  value: string;
  options: { id: string; label: string }[];
  onSave: (v: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSaving(true);
    try {
      await onSave(e.target.value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className={`w-full rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
        saved ? "border-green-400 bg-green-50" : "border-gray-200"
      } disabled:opacity-50`}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function CataloguePage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        search,
        status: statusFilter,
        limit: String(PAGE_SIZE),
      });
      const res = await adminFetch(`/api/admin/products-list?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped: AdminProduct[] = ((data.products as ProductsListApiItem[]) ?? []).map((item) => ({
        id: item.id,
        name: item.title,
        slug: item.handle,
        sku: item.sku,
        regular_price: Number(item.regular_price ?? 0),
        status: item.status,
        featured_image_url: item.featured_image_url,
        categories: item.categories ? { id: "", name: item.categories } : null,
      }));
      setProducts(mapped);
      setTotal(data.total ?? 0);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    adminFetch("/api/admin/ia/categories-list")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  const patchProduct = useCallback(
    async (id: string, field: string, value: string | number) => {
      const res = await adminFetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...data.product } : p)),
      );
    },
    [],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(
      selected.size === products.length
        ? new Set()
        : new Set(products.map((p) => p.id)),
    );
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await adminFetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          action: bulkAction,
          value: bulkValue || undefined,
        }),
      });
      if (res.ok) {
        await fetchProducts();
        setSelected(new Set());
        setBulkAction("");
        setBulkValue("");
      }
    } catch {
      /* ignore */
    } finally {
      setBulkLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Vue Excel — Catalogue</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/produits"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            📋 Vue liste
          </Link>
          <a
            href="/api/admin/export-products"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ⬇️ Exporter CSV
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
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-blue-800">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <button onClick={toggleAll} className="text-xs text-blue-600 underline">
            {selected.size === products.length ? "Désélectionner tout" : "Tout sélectionner"}
          </button>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
          >
            <option value="">Actions groupées ▼</option>
            <option value="publish">Publier</option>
            <option value="draft">Mettre en brouillon</option>
            <option value="price_discount">Remise % →</option>
            <option value="price_increase">Hausse % →</option>
            <option value="change_category">Changer catégorie →</option>
          </select>
          {(bulkAction === "price_discount" || bulkAction === "price_increase") && (
            <input
              type="number"
              min={1}
              max={100}
              placeholder="%"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            />
          )}
          {bulkAction === "change_category" && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Choisir…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleBulkAction}
            disabled={bulkLoading || !bulkAction}
            className="rounded bg-[#cc1818] px-3 py-1 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-50"
          >
            {bulkLoading ? "…" : "Appliquer"}
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === products.length && products.length > 0}
                  onChange={toggleAll}
                  className="accent-[#cc1818]"
                />
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
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
                  Aucun produit
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-gray-50 transition-colors ${selected.has(p.id) ? "bg-blue-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-[#cc1818]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-10 w-10 overflow-hidden rounded border border-gray-100 bg-gray-50">
                      {p.featured_image_url ? (
                        <Image
                          src={p.featured_image_url}
                          alt={p.name}
                          width={40}
                          height={40}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="h-full w-full bg-gray-100" />
                      )}
                    </div>
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <EditableCell
                      value={p.name}
                      onSave={(v) => patchProduct(p.id, "name", v)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={p.sku ?? ""}
                      onSave={(v) => patchProduct(p.id, "sku", v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditableCell
                      value={p.regular_price}
                      type="number"
                      onSave={(v) => patchProduct(p.id, "regular_price", parseFloat(v))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectCell
                      value={p.status}
                      options={[
                        { id: "publish", label: "Publié" },
                        { id: "draft", label: "Brouillon" },
                      ]}
                      onSave={(v) => patchProduct(p.id, "status", v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <SeoVoyant score={seoScore(p)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <Link
                        href={`/product/${p.slug}`}
                        target="_blank"
                        className="text-gray-400 hover:text-[#cc1818] transition-colors"
                        title="Voir"
                      >
                        👁️
                      </Link>
                      <Link
                        href={`/admin/produits/${p.id}`}
                        className="text-gray-400 hover:text-[#cc1818] transition-colors"
                        title="Éditer"
                      >
                        ✏️
                      </Link>
                      <a
                        href={`/api/product-pdf/${p.slug}`}
                        target="_blank"
                        className="text-gray-400 hover:text-[#cc1818] transition-colors"
                        title="PDF"
                      >
                        📄
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page + 1} sur {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
