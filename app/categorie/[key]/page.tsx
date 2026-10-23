import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyCard } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const catalog = await catalogForPage();
  const cat = catalog.categories.find((c) => c.category_key === key);
  if (!cat) notFound();
  const parent = cat.parent_category_key ? catalog.categories.find((c) => c.category_key === cat.parent_category_key) : undefined;
  const children = catalog.childCategories(cat.category_key);
  const families = catalog.familiesInCategory(cat.category_key);
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Accueil", href: "/" },
          ...(parent ? [{ label: parent.name, href: `/categorie/${parent.category_key}` }] : []),
          { label: cat.name },
        ]}
      />
      <h1 className="text-3xl font-bold text-gray-900">{cat.name}</h1>
      {children.length > 0 && (
        <nav aria-label="Sous-catégories" className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Link key={c.category_key} href={`/categorie/${c.category_key}`} className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:border-[#cc1818]">
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {families.length === 0 ? (
        <p className="text-gray-600">Aucune famille publiée directement dans cette catégorie.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((f) => (
            <FamilyCard key={f.public_family_key} slug={f.slug} name={f.name} description={f.description_short} imageSha={f.image_main_sha256} itemCount={f.items.length} />
          ))}
        </div>
      )}
    </div>
  );
}
