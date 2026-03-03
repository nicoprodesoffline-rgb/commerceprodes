"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "lib/admin/fetch";

interface AdminVariant {
  id: string;
  sku: string | null;
  name: string | null;
  regular_price: number | null;
  stock_quantity: number | null;
  stock_status: string | null;
  status: string | null;
  min_quantity?: number | null;
  group_of_quantity?: number | null;
  supplier_ref?: string | null;
  eco_contribution?: number | null;
  variant_attributes?: Array<{
    attribute_name: string;
    attribute_value: string;
    position: number;
  }>;
}

interface AdminProduct {
  id: string;
  title: string;
  handle: string;
  sku: string | null;
  type: string | null;
  regular_price: number | null;
  sale_price: number | null;
  status: string;
  stock_quantity: number | null;
  stock_status: string | null;
  supplier_ref: string | null;
  family_role: string | null;
  parent_sku: string | null;
  featured_image_url: string | null;
  variant_count: number;
  family_id: string | null;
  family_name: string | null;
  family_children_count: number;
  can_expand: boolean;
  categories: string | null;
  updated_at: string | null;
}

interface FetchResult {
  products: AdminProduct[];
  total: number;
}

interface ProductDetailState {
  loading: boolean;
  error: string | null;
  variations: AdminVariant[];
  total: number;
}

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  { value: "updated_at-desc", label: "Mis à jour récemment" },
  { value: "created_at-desc", label: "Plus récents" },
  { value: "regular_price-asc", label: "Prix croissant" },
  { value: "regular_price-desc", label: "Prix décroissant" },
  { value: "name-asc", label: "A-Z" },
];

function formatPriceFR(price: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " €";
}

function formatDateFR(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVariantLabel(variant: AdminVariant): string {
  const attrs = (variant.variant_attributes ?? [])
    .sort((a, b) => a.position - b.position)
    .map((a) => `${a.attribute_name}: ${a.attribute_value}`);
  return attrs.length > 0 ? attrs.join(" · ") : "—";
}

export default function AdminProduitsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("publish");
  const [sort, setSort] = useState("updated_at-desc");
  const [onlyExpandable, setOnlyExpandable] = useState(false);
  const [loading, setLoading] = useState(true);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailByProduct, setDetailByProduct] = useState<Record<string, ProductDetailState>>({});
  const [variantDrafts, setVariantDrafts] = useState<Record<string, Partial<AdminVariant>>>({});
  const [variantSaving, setVariantSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        search: debouncedSearch,
        status: statusFilter,
        sort,
        limit: String(PAGE_SIZE),
      });
      const res = await adminFetch(`/api/admin/products-list?${params}`);
      if (!res.ok) throw new Error("Erreur API produits");
      const data: FetchResult = await res.json();
      const next = (data.products ?? []) as AdminProduct[];
      setProducts(onlyExpandable ? next.filter((p) => p.can_expand) : next);
      setTotal(data.total ?? 0);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, sort, onlyExpandable]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const loadProductDetails = useCallback(async (productId: string) => {
    setDetailByProduct((prev) => ({
      ...prev,
      [productId]: {
        loading: true,
        error: null,
        variations: prev[productId]?.variations ?? [],
        total: prev[productId]?.total ?? 0,
      },
    }));

    try {
      const res = await adminFetch(`/api/admin/products/${productId}/variations?page=1&limit=250`);
      const data = await res.json();
      if (!res.ok) {
        setDetailByProduct((prev) => ({
          ...prev,
          [productId]: { loading: false, error: data.error ?? "Erreur chargement variantes", variations: [], total: 0 },
        }));
        return;
      }
      setDetailByProduct((prev) => ({
        ...prev,
        [productId]: {
          loading: false,
          error: null,
          variations: data.variations ?? [],
          total: data.total ?? (data.variations ?? []).length,
        },
      }));
    } catch {
      setDetailByProduct((prev) => ({
        ...prev,
        [productId]: { loading: false, error: "Erreur réseau", variations: [], total: 0 },
      }));
    }
  }, []);

  function toggleExpand(product: AdminProduct) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.add(product.id);
        if (!detailByProduct[product.id]) {
          loadProductDetails(product.id);
        }
      }
      return next;
    });
  }

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("publish");
    setSort("updated_at-desc");
    setOnlyExpandable(false);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function draftKey(productId: string, variantId: string) {
    return `${productId}:${variantId}`;
  }

  function patchVariantDraft(productId: string, variantId: string, patch: Partial<AdminVariant>) {
    const key = draftKey(productId, variantId);
    setVariantDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }));
  }

  async function saveVariant(productId: string, variant: AdminVariant) {
    const key = draftKey(productId, variant.id);
    const draft = variantDrafts[key] ?? {};
    if (Object.keys(draft).length === 0) return;
    setVariantSaving((prev) => new Set(prev).add(key));
    try {
      const res = await adminFetch(`/api/admin/products/${productId}/variations/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDetailByProduct((prev) => {
        const state = prev[productId];
        if (!state) return prev;
        const updated = state.variations.map((item) =>
          item.id === variant.id ? { ...item, ...(data.variation ?? {}) } : item,
        );
        return { ...prev, [productId]: { ...state, variations: updated } };
      });
      setVariantDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setVariantSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {total > 0 ? `${total.toLocaleString("fr-FR")} produits` : "Chargement…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/catalogue"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
          >
            Vue Excel
          </Link>
          <a
            href="/api/admin/export-products"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Rechercher un produit ou SKU…"
            className="flex-1 min-w-48 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
          >
            <option value="publish">Publié</option>
            <option value="draft">Brouillon</option>
            <option value="all">Tous</option>
          </select>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={onlyExpandable}
              onChange={(e) => {
                setOnlyExpandable(e.target.checked);
                setPage(0);
              }}
            />
            Variantes/familles uniquement
          </label>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">Chargement…</div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-gray-500">Aucun produit trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-2 py-3 text-left font-medium text-gray-500 w-10">+</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 w-14">Photo</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Produit</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden md:table-cell">SKU</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Type</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Prix HT</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Stock</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Structure</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => {
                  const expanded = expandedIds.has(p.id);
                  const detail = detailByProduct[p.id];
                  const hasVariants = p.variant_count > 0;
                  const hasFamily = Boolean(p.family_id);
                  return (
                    <Fragment key={p.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-2">
                          {p.can_expand ? (
                            <button
                              onClick={() => toggleExpand(p)}
                              className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                              title="Afficher variantes / famille"
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {p.featured_image_url ? (
                            <Image
                              src={p.featured_image_url}
                              alt={p.title}
                              width={48}
                              height={48}
                              className="h-12 w-12 rounded object-contain bg-gray-100"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
                              📦
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/product/${p.handle}`}
                            target="_blank"
                            className="font-medium text-gray-800 hover:text-[#cc1818] transition-colors line-clamp-2"
                          >
                            {p.title}
                          </Link>
                          <div className="mt-1 text-xs text-gray-500">
                            {p.categories || "Sans catégorie"}
                            {p.parent_sku ? <span className="ml-2">· parent_sku: {p.parent_sku}</span> : null}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-400">
                            Maj: {formatDateFR(p.updated_at)}
                          </div>
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <span className="font-mono text-xs text-gray-500">{p.sku || "—"}</span>
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{p.type || "—"}</span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{formatPriceFR(p.regular_price)}</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-xs text-gray-600">
                          {p.stock_quantity != null ? `${p.stock_quantity}` : "—"} · {p.stock_status || "—"}
                          {p.supplier_ref ? <div className="text-[11px] text-gray-400">Fourn.: {p.supplier_ref}</div> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <div className="text-xs text-gray-700">
                              {hasVariants ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{p.variant_count} variantes</span>
                              ) : (
                                <span className="text-gray-400">Sans variante</span>
                              )}
                            </div>
                            {hasFamily ? (
                              <div className="text-xs text-green-700">
                                Famille: {p.family_name} ({p.family_children_count} filles)
                              </div>
                            ) : hasVariants ? (
                              <div className="text-xs text-gray-400">Famille non assemblée</div>
                            ) : (
                              <div className="text-xs text-gray-400">Produit simple</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {p.status === "publish" ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Publié</span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Brouillon</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/produits/${p.id}`}
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="Modifier le produit"
                            >
                              ✏️
                            </Link>
                            <Link
                              href={`/product/${p.handle}`}
                              target="_blank"
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="Voir la fiche"
                            >
                              👁️
                            </Link>
                            <a
                              href={`/api/product-pdf/${p.handle}`}
                              target="_blank"
                              className="text-gray-400 hover:text-[#cc1818] transition-colors"
                              title="Fiche PDF"
                            >
                              📄
                            </a>
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-gray-800">
                                  Variantes et structure produit
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  {hasFamily && p.family_name ? (
                                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                                      Famille active: {p.family_name}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                                      Aucune famille DB (variantes natives seulement)
                                    </span>
                                  )}
                                  <Link href="/admin/familles" className="text-blue-600 hover:underline">
                                    Ouvrir l&apos;onglet Mères / Filles
                                  </Link>
                                </div>
                              </div>

                              {detail?.loading ? (
                                <p className="text-sm text-gray-400">Chargement des variantes…</p>
                              ) : detail?.error ? (
                                <p className="text-sm text-red-600">{detail.error}</p>
                              ) : (detail?.variations ?? []).length === 0 ? (
                                <p className="text-sm text-gray-500">Aucune variante technique trouvée.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-50 text-gray-500">
                                      <tr>
                                        <th className="px-2 py-2 text-left">SKU</th>
                                        <th className="px-2 py-2 text-left">Options</th>
                                        <th className="px-2 py-2 text-right">Prix</th>
                                        <th className="px-2 py-2 text-center">Stock</th>
                                        <th className="px-2 py-2 text-center">Qté</th>
                                        <th className="px-2 py-2 text-center">Lot min</th>
                                        <th className="px-2 py-2 text-left">Fournisseur</th>
                                        <th className="px-2 py-2 text-center">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {(detail?.variations ?? []).map((variant) => {
                                        const key = draftKey(p.id, variant.id);
                                        const draft = variantDrafts[key] ?? {};
                                        const saving = variantSaving.has(key);
                                        return (
                                          <tr key={variant.id}>
                                            <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">
                                              {variant.sku || "—"}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-700">{getVariantLabel(variant)}</td>
                                            <td className="px-2 py-1.5">
                                              <input
                                                type="number"
                                                step="0.01"
                                                value={String(draft.regular_price ?? variant.regular_price ?? "")}
                                                onChange={(e) =>
                                                  patchVariantDraft(p.id, variant.id, {
                                                    regular_price: e.target.value === "" ? null : Number(e.target.value),
                                                  })
                                                }
                                                className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                              />
                                            </td>
                                            <td className="px-2 py-1.5">
                                              <select
                                                value={String(draft.stock_status ?? variant.stock_status ?? "instock")}
                                                onChange={(e) => patchVariantDraft(p.id, variant.id, { stock_status: e.target.value })}
                                                className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                              >
                                                <option value="instock">En stock</option>
                                                <option value="outofstock">Épuisé</option>
                                                <option value="onbackorder">Sur commande</option>
                                              </select>
                                            </td>
                                            <td className="px-2 py-1.5">
                                              <input
                                                type="number"
                                                value={String(draft.stock_quantity ?? variant.stock_quantity ?? "")}
                                                onChange={(e) =>
                                                  patchVariantDraft(p.id, variant.id, {
                                                    stock_quantity: e.target.value === "" ? null : Number(e.target.value),
                                                  })
                                                }
                                                className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                              />
                                            </td>
                                            <td className="px-2 py-1.5">
                                              <input
                                                type="number"
                                                value={String(draft.group_of_quantity ?? variant.group_of_quantity ?? 1)}
                                                onChange={(e) =>
                                                  patchVariantDraft(p.id, variant.id, {
                                                    group_of_quantity: e.target.value === "" ? null : Number(e.target.value),
                                                  })
                                                }
                                                className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                              />
                                            </td>
                                            <td className="px-2 py-1.5">
                                              <input
                                                type="text"
                                                value={String(draft.supplier_ref ?? variant.supplier_ref ?? "")}
                                                onChange={(e) => patchVariantDraft(p.id, variant.id, { supplier_ref: e.target.value })}
                                                className="w-32 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                              />
                                            </td>
                                            <td className="px-2 py-1.5 text-center">
                                              <button
                                                onClick={() => saveVariant(p.id, variant)}
                                                disabled={saving || Object.keys(draft).length === 0}
                                                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                                              >
                                                {saving ? "…" : "Sauver"}
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
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
