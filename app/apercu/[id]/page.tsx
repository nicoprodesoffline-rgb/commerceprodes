import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSections } from "@/components/content/sections";
import { catalogForPage } from "@/lib/site-catalog/page";
import { pageFromV2 } from "@/lib/site-content/v2";
import { getPool } from "@/lib/site-db/pool";
import { readPreview } from "@/lib/site-publish/preview-store";

export const dynamic = "force-dynamic";
// Un aperçu n'est jamais indexé ni mis en cache (aussi par les en-têtes de next.config.ts).
export const metadata: Metadata = { title: "Aperçu", robots: { index: false, follow: false } };

/** Cercle 3 (3.26, B14) : la page en brouillon, rendue par le SITE avec ses vrais composants, sans qu'elle soit publiée. 404 après expiration. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doc: Record<string, any> | null = null;
  try {
    doc = await readPreview(getPool(), id);
  } catch {
    doc = null;
  }
  if (doc === null || typeof doc["page"] !== "object" || doc["page"] === null) notFound();
  const page = pageFromV2(doc["page"]);
  const catalog = await catalogForPage();
  return (
    <div className="min-w-0" data-testid="page-preview">
      <p role="note" className="mb-4 rounded-[9px] border border-caution bg-white p-3 text-sm text-ink-2" data-testid="preview-banner">Aperçu : cette page n&apos;est pas publiée et disparaît dans 30 minutes au plus.</p>
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: page.title }]} />
      {page.sections[0]?.type !== "hero" && <h1 className="mb-6 whitespace-pre-line text-3xl font-semibold [overflow-wrap:anywhere]">{page.title}</h1>}
      <PageSections page={page} catalog={catalog} />
    </div>
  );
}
