import Link from "next/link";
import { supabase } from "lib/supabase/client";

export default async function AdminCategoriesPage() {
  // Fetch all categories
  const { data: allCatsRaw } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, position")
    .order("position", { ascending: true });

  const allCats = allCatsRaw ?? [];

  // Fetch product counts
  const { data: pcRows } = await supabase
    .from("product_categories")
    .select("category_id");

  const countMap: Record<string, number> = {};
  if (pcRows) {
    for (const row of pcRows as { category_id: string }[]) {
      countMap[row.category_id] = (countMap[row.category_id] ?? 0) + 1;
    }
  }

  // Build hierarchy
  type Cat = {
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    position: number;
    directCount: number;
    children: Cat[];
  };

  const catMap: Record<string, Cat> = {};
  const roots: Cat[] = [];

  for (const c of allCats as any[]) {
    catMap[c.id] = {
      id: c.id,
      name: c.name,
      slug: c.slug,
      parent_id: c.parent_id,
      position: c.position,
      directCount: countMap[c.id] ?? 0,
      children: [],
    };
  }

  for (const cat of Object.values(catMap)) {
    if (cat.parent_id && catMap[cat.parent_id]) {
      catMap[cat.parent_id]!.children.push(cat);
    } else {
      roots.push(cat);
    }
  }

  // Compute total (direct + children)
  function totalCount(cat: Cat): number {
    return cat.directCount + cat.children.reduce((acc, c) => acc + totalCount(c), 0);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Catégories
        <span className="ml-2 text-lg font-normal text-gray-500">
          ({allCats.length})
        </span>
      </h1>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Slug</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Directs</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {roots.map((cat) => (
              <>
                {/* Catégorie racine */}
                <tr key={cat.id} className="bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {cat.name}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">
                    {cat.slug}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {cat.directCount}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    {totalCount(cat)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/search/${cat.slug}`}
                      target="_blank"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      ↗ Voir
                    </Link>
                  </td>
                </tr>

                {/* Sous-catégories */}
                {cat.children.map((child) => (
                  <tr key={child.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 pl-8">
                      └ {child.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">
                      {child.slug}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {child.directCount}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {totalCount(child)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/search/${child.slug}`}
                        target="_blank"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ↗ Voir
                      </Link>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
