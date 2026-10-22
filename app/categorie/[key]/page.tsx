import { notFound } from "next/navigation";
import { FamilyCard } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getCategories, getFamiliesByCategory } from "@/lib/site-dto";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const cat = getCategories().find((c) => c.category_key === key);
  if (!cat) notFound();
  const families = getFamiliesByCategory(cat.category_key);
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: cat.name }]} />
      <h1 className="text-3xl font-bold text-gray-900">{cat.name}</h1>
      {families.length === 0 ? (
        <p className="text-gray-600">Aucune famille publiée dans cette catégorie.</p>
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
