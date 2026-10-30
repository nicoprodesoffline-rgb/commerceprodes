import { CategoryGrid } from "@/components/home/category-grid";
import { FamilyGrid } from "@/components/home/family-card";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

/** Accueil : catégories racines puis familles, dans l'ordre du DTO (aucune règle de mise en avant inventée). */
export default async function HomePage() {
  const catalog = await catalogForPage();
  const roots = navigationOf(catalog).menu.map((n) => ({
    key: n.key,
    name: n.name,
    familyCount: n.ownFamilyCount,
    children: n.children.map((s) => ({ key: s.key, name: s.name })),
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
