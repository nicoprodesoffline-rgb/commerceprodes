import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSections } from "@/components/content/sections";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogForPage } from "@/lib/site-catalog/page";
import { liveSections } from "@/lib/site-content/blocks";
import { editorialMetadata } from "@/lib/site-content/metadata";
import { editorialSlug } from "@/lib/site-content/pages";
import { editorialPath } from "@/lib/seo/seo";
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
  const page = await publishedPage(props);
  // 3.19 (S11) : une canonique sur toute page ; sans chemin canonique saisi, l'adresse de la page elle-même.
  return editorialMetadata({ ...page, canonical: page.canonical || editorialPath(page.slug) }, process.env.SITE_PUBLIC_ORIGIN);
}

export default async function EditorialPage(props: Props) {
  const page = await publishedPage(props);
  const catalog = await catalogForPage();
  return (
    <div className="min-w-0">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: page.title }]} />
      {liveSections(page.sections, serverNowUtc())[0]?.type !== "hero" && <h1 className="mb-6 whitespace-pre-line text-3xl font-semibold [overflow-wrap:anywhere]">{page.title}</h1>}
      <PageSections page={page} catalog={catalog} />
    </div>
  );
}
