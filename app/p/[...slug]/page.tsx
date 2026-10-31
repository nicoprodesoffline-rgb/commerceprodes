import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSections } from "@/components/content/sections";
import { catalogForPage } from "@/lib/site-catalog/page";
import { editorialMetadata } from "@/lib/site-content/metadata";
import { editorialSlug } from "@/lib/site-content/pages";
import { getEditorialSet } from "@/lib/site-content/source";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string[] }> };

async function publishedPage({ params }: Props) {
  const slug = editorialSlug((await params).slug);
  if (!slug) notFound();
  const page = (await getEditorialSet())?.pages.find(p => p.slug === slug);
  if (!page) notFound();
  return page;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return editorialMetadata(await publishedPage(props), process.env.SITE_PUBLIC_ORIGIN);
}

export default async function EditorialPage(props: Props) {
  const page = await publishedPage(props);
  const catalog = await catalogForPage();
  return (
    <div className="min-w-0">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: page.title }]} />
      {page.sections[0]?.type !== "hero" && <h1 className="mb-6 whitespace-pre-line text-3xl font-semibold [overflow-wrap:anywhere]">{page.title}</h1>}
      <PageSections page={page} catalog={catalog} />
    </div>
  );
}
