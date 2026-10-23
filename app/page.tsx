import CategoryGrid from "@/components/home/category-grid";
import { FamilyCard } from "@/components/home/family-card";
import Hero from "@/components/home/hero";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await catalogForPage();
  const categories = catalog.categories.map((c) => ({ ...c, family_count: catalog.familiesInCategory(c.category_key).length }));
  const itemCount = catalog.families.reduce((n, f) => n + f.items.length, 0);
  return (
    <div className="-mx-4 -mt-8 lg:-mx-6">
      <Hero dataLabel={catalog.meta.data_label} familyCount={catalog.families.length} itemCount={itemCount} />
      <div className="space-y-12 px-4 py-10 lg:px-6">
        <div id="categories">
          <CategoryGrid categories={categories} />
        </div>
        <section id="familles" aria-labelledby="fam-h">
          <h2 id="fam-h" className="mb-6 text-2xl font-bold text-gray-900">Familles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.families.map((f) => (
              <FamilyCard
                key={f.public_family_key}
                slug={f.slug}
                name={f.name}
                description={f.description_short}
                imageSha={f.image_main_sha256}
                itemCount={f.items.length}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
