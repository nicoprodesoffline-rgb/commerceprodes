import Grid from "components/grid";
import { ProductCardImage } from "components/product-image";
import type { CategoryView, FamilyView } from "lib/site-dto/types";
import Link from "next/link";

// BC1-B : carte FAMILLE (pas d'achat direct). Pas de prix agrégé « à partir de »
// (ce serait un calcul) : le prix est sélectionné sur la fiche, par item et quantité.
export default function ProductGridItems({
  families,
  categories,
}: {
  families: FamilyView[];
  categories: CategoryView[];
}) {
  return (
    <>
      {families.map((family) => {
        const category = categories.find((c) => c.category_key === family.primary_category_key);
        return (
          <Grid.Item key={family.slug} className="animate-fadeIn">
            <Link
              className="group relative flex h-full w-full flex-col rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-[#cc1818] hover:shadow-md transition-all duration-200"
              href={`/product/${family.slug}`}
              prefetch={true}
            >
              {/* Image — ratio 4:3 */}
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-gray-50">
                <ProductCardImage
                  src={family.image_main_url}
                  alt={family.name}
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>

              <div className="flex flex-1 flex-col p-3">
                {category && (
                  <span className="mb-1 self-start rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#cc1818]">
                    {category.name}
                  </span>
                )}
                <h3 className="line-clamp-2 text-sm font-medium text-gray-800 leading-tight flex-1">
                  {family.name}
                </h3>
                <p className="mt-2 text-xs text-gray-500">
                  {family.items.length > 1
                    ? `${family.items.length} variantes publiées`
                    : "Variante unique"}{" "}
                  · prix selon variante et quantité
                </p>
                <span className="mt-2 text-xs font-semibold text-[#cc1818]">Voir la fiche →</span>
              </div>
            </Link>
          </Grid.Item>
        );
      })}
    </>
  );
}
