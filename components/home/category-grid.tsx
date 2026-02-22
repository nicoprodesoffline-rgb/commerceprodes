import Link from "next/link";
import type { CategoryWithCount } from "lib/supabase/types";

export default function CategoryGrid({
  categories,
}: {
  categories: CategoryWithCount[];
}) {
  if (!categories.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Nos catégories</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/search/${cat.slug}`}
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all duration-150"
          >
            <span className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">
              {cat.name}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              {cat.product_count > 0
                ? `${cat.product_count} produit${cat.product_count > 1 ? "s" : ""}`
                : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
