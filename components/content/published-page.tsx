import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSections } from "@/components/content/sections";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogForPage } from "@/lib/site-catalog/page";
import { liveSections } from "@/lib/site-content/blocks";
import type { EditorialPage } from "@/lib/site-content/model";
import { getEditorialSet } from "@/lib/site-content/source";

/** Cercle 3, 3.24 : la page éditable publiée à cette adresse (FAQ, contact, mentions légales, livraison), ou null. */
export async function publishedAt(path: string): Promise<EditorialPage | null> {
  return (await getEditorialSet())?.pages.find(p => p.slug === path) ?? null;
}

/** Une page éditable servie à son adresse d'origine : même rendu que /p/<adresse>. */
export async function EditablePage({ page }: { page: EditorialPage }) {
  const catalog = await catalogForPage();
  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: page.title }]} />
      {liveSections(page.sections, serverNowUtc())[0]?.type !== "hero" && <h1 className="text-2xl font-semibold whitespace-pre-line [overflow-wrap:anywhere]">{page.title}</h1>}
      <PageSections page={page} catalog={catalog} />
    </div>
  );
}

/** La page de la Factory, ou 404 : pour une adresse qui n'existe que si elle est publiée (livraison). */
export async function requirePublished(path: string): Promise<EditorialPage> {
  const page = await publishedAt(path);
  if (page === null) notFound();
  return page;
}
