import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyGrid } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { categoryCrumbs, familyCard } from "@/components/site/catalog-views";
import { catalogForPage } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const catalog = await catalogForPage();
  const cat = catalog.categories.find((c) => c.category_key === key);
  return { title: cat?.name ?? "Catégorie introuvable" };
}

/** Catégorie : sous-catégories, familles classées ici en principal puis via `secondary_category_keys` (DTO). */
export default async function CategoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const catalog = await catalogForPage();
  const cat = catalog.categories.find((c) => c.category_key === key);
  if (!cat) notFound();
  const children = catalog.childCategories(cat.category_key);
  const families = catalog.familiesInCategory(cat.category_key);
  const notes: Record<string, string> = {};
  for (const f of families) if (f.primary_category_key !== key) notes[f.slug] = "classée aussi ici";
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, key)]} />
      <h1 className="text-2xl font-semibold">{cat.name}</h1>
      {children.length > 0 && (
        <nav aria-label="Sous-catégories">
          <ul className="flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.category_key}>
                <Link href={`/categorie/${c.category_key}`} className="inline-flex min-h-[34px] items-center rounded-full border border-line-strong bg-white px-3 text-sm hover:bg-surface">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {families.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-4 text-ink-2">
          Aucune famille n&apos;est classée directement dans cette catégorie{children.length > 0 ? " : consultez ses sous-catégories." : "."}
        </p>
      ) : (
        <FamilyGrid families={families.map(familyCard)} label={`Familles de la catégorie ${cat.name}`} notes={notes} />
      )}
    </div>
  );
}
