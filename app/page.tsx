import CategoryGrid from "@/components/home/category-grid";
import { FamilyCard } from "@/components/home/family-card";
import Hero from "@/components/home/hero";
import { getCategories, getFamilies, getFamiliesByCategory } from "@/lib/site-dto";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const categories = getCategories().map((c) => ({ ...c, family_count: getFamiliesByCategory(c.category_key).length }));
  const families = getFamilies();
  return (
    <div className="-mx-4 -mt-8 lg:-mx-6">
      <Hero />
      <div className="space-y-12 px-4 py-10 lg:px-6">
        <div id="categories">
          <CategoryGrid categories={categories} />
        </div>
        <section id="familles" aria-labelledby="fam-h">
          <h2 id="fam-h" className="mb-6 text-2xl font-bold text-gray-900">Familles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {families.map((f) => (
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
