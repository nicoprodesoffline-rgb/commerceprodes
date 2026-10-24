import { CategoryGrid } from "@/components/home/category-grid";
import { FamilyGrid } from "@/components/home/family-card";
import { familyCard } from "@/components/site/catalog-views";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

/** Accueil : catégories racines puis familles, dans l'ordre du DTO (aucune règle de mise en avant inventée). */
export default async function HomePage() {
  const catalog = await catalogForPage();
  const roots = catalog.categories
    .filter((c) => c.parent_category_key === null)
    .map((c) => ({
      key: c.category_key,
      name: c.name,
      familyCount: catalog.familiesInCategory(c.category_key).length,
      children: catalog.childCategories(c.category_key).map((s) => ({ key: s.category_key, name: s.name })),
    }));
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Catalogue</h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          Choisissez une famille de produits, puis sa variante. Les prix affichés sont les prix de vente PRODES publiés, sélectionnés par
          le serveur au moment de l&apos;affichage ; taxes et port ne sont pas calculés.
        </p>
      </header>
      <section id="categories" aria-labelledby="cat-h">
        <h2 id="cat-h" className="mb-3 text-lg font-semibold">Catégories</h2>
        <CategoryGrid categories={roots} />
      </section>
      <section id="familles" aria-labelledby="fam-h">
        <h2 id="fam-h" className="mb-3 text-lg font-semibold">
          Familles <span className="text-sm font-normal text-ink-3">({catalog.families.length})</span>
        </h2>
        <FamilyGrid families={catalog.families.map(familyCard)} label="Familles publiées" />
      </section>
    </div>
  );
}
