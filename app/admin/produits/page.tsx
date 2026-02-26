"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface AdminProduct {
  id: string;
  title: string;
  handle: string;
  sku: string | null;
  regular_price: number | null;
  status: string;
  featured_image_url: string | null;
  variant_count: number;
  categories: string;
}

interface FetchResult {
  products: AdminProduct[];
  total: number;
}

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  { value: "created_at-desc", label: "Plus récents" },
  { value: "regular_price-asc", label: "Prix croissant" },
  { value: "regular_price-desc", label: "Prix décroissant" },
  { value: "name-asc", label: "A–Z" },
];

function formatPriceFR(price: number | null): string {
  if (!price || price === 0) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " €";
}

export default function AdminProduitsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("publish");
  const [sort, setSort] = useState("created_at-desc");
  const [loading, setLoading] = useState(true);

  // Debounce search
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
      });
      const res = await fetch(`/api/admin/products-list?${params}`);
      if (res.ok) {
        const data: FetchResult = await res.json();
        setProducts(data.products);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, sort]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("publish");
    setSort("created_at-desc");
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {total > 0 ? `${total.toLocaleString("fr-FR")} produits au total` : "Chargement…"}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/admin/export-products"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
          >
            Exporter CSV
          </a>
          <button className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed" disabled>
            + Ajouter
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Rechercher un produit ou SKU…"
            className="flex-1 min-w-48 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
          >
            <option value="publish">Publié</option>
            <option value="draft">Brouillon</option>
            <option value="">Tous</option>
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            Chargement…
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            Aucun produit trouvé.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 w-14">Photo</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Titre</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden md:table-cell">SKU</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Catégorie</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Prix HT</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Variants</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
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
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className="font-mono text-xs text-gray-500">{p.sku || "—"}</span>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {p.categories ? (
                        <span className="rounded-sm bg-red-50 px-1.5 py-0.5 text-xs text-[#cc1818]">
                          {p.categories}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                      {formatPriceFR(p.regular_price)}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      {p.variant_count > 0 ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {p.variant_count}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {p.status === "publish" ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Publié
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Brouillon
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 bg-gray-50">
            <span className="text-xs text-gray-500">
              Produits {from}–{to} sur {total.toLocaleString("fr-FR")}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 transition-colors"
              >
                ← Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 transition-colors"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
