import Link from "next/link";
import Image from "next/image";
import { supabase } from "lib/supabase/client";

const PER_PAGE = 50;

function StatusBadge({ status }: { status: string }) {
  return status === "publish" ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Publié
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      Brouillon
    </span>
  );
}

export default async function AdminProductsPage(props: {
  searchParams?: Promise<{ page?: string; q?: string; cat?: string }>;
}) {
  const searchParams = await props.searchParams;
  const currentPage = Math.max(1, parseInt(searchParams?.page || "1"));
  const searchQuery = searchParams?.q || "";
  const offset = (currentPage - 1) * PER_PAGE;

  // Fetch total count
  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true });
  if (searchQuery) countQuery = countQuery.ilike("name", `%${searchQuery}%`);
  const { count: totalCount } = await countQuery;

  // Fetch products
  let query = supabase
    .from("products")
    .select(
      `
      id, name, slug, status, sku, regular_price, created_at,
      product_images (url, is_featured, position),
      product_categories (
        categories (id, name, slug)
      )
    `,
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (searchQuery) query = query.ilike("name", `%${searchQuery}%`);

  const { data: products = [] } = await query;
  const total = totalCount ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Catalogue produits
          <span className="ml-2 text-lg font-normal text-gray-500">
            ({total.toLocaleString("fr-FR")} produits)
          </span>
        </h1>
      </div>

      {/* Search */}
      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={searchQuery}
          placeholder="Rechercher par nom…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Rechercher
        </button>
        {searchQuery && (
          <Link
            href="/admin/products"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Effacer
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 w-12">Img</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Titre</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Catégorie</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Prix HT</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(products as any[]).map((p) => {
              const imgs: any[] = (p.product_images || []).sort(
                (a: any, b: any) => a.position - b.position,
              );
              const img =
                imgs.find((i) => i.is_featured) ?? imgs[0];
              const cats = (p.product_categories || [])
                .map((pc: any) => pc.categories?.name)
                .filter(Boolean);

              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {img ? (
                      <Image
                        src={img.url}
                        alt={p.name}
                        width={40}
                        height={40}
                        className="rounded object-contain border border-gray-100"
                        onError={() => {}}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-300">
                        📦
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                    <span className="line-clamp-2">{p.name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden lg:table-cell">
                    {p.sku || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {cats[0] || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                    {p.regular_price
                      ? new Intl.NumberFormat("fr-FR", {
                          minimumFractionDigits: 2,
                        }).format(p.regular_price) + " €"
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/products/${p.slug}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Détail
                      </Link>
                      <Link
                        href={`/product/${p.slug}`}
                        target="_blank"
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        ↗ Site
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {currentPage > 1 && (
            <Link
              href={`/admin/products?page=${currentPage - 1}${searchQuery ? `&q=${searchQuery}` : ""}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              ← Précédent
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/admin/products?page=${currentPage + 1}${searchQuery ? `&q=${searchQuery}` : ""}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Suivant →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
