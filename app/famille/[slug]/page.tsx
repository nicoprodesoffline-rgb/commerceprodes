import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FamilyBuyBox } from "@/components/product/family-buy-box";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogForPage } from "@/lib/site-catalog/page";
import { priceRows, selectorAxes } from "@/lib/site-catalog/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const catalog = await catalogForPage();
  const f = catalog.familyBySlug((await params).slug);
  return { title: f?.name ?? "Famille introuvable" };
}

export default async function FamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ article?: string | string[] }>;
}) {
  const { slug } = await params;
  const { article } = await searchParams;
  const catalog = await catalogForPage();
  const family = catalog.familyBySlug(slug);
  if (!family) notFound();
  const instant = serverNowUtc();
  const meta = catalog.meta;
  const cat = catalog.categories.find((c) => c.category_key === family.primary_category_key);
  const items = family.items.map((i) => ({
    public_item_key: i.public_item_key,
    variant_axes: i.variant_axes,
    image_sha256: i.public_media_refs[0] ?? null,
    rows: priceRows(catalog.c0Generation, i, instant),
  }));
  const preselected = typeof article === "string" && items.some((i) => i.public_item_key === article) ? article : undefined;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Accueil", href: "/" },
          ...(cat ? [{ label: cat.name, href: `/categorie/${cat.category_key}` }] : []),
          { label: family.name },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/media/${family.image_main_sha256}`}
            alt={`Image principale de la famille ${family.name}`}
            className="aspect-square w-full rounded-xl border border-gray-200 bg-white object-contain [image-rendering:pixelated]"
            data-testid="family-image"
          />
        </div>
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Famille <span className="font-mono">{family.public_family_key}</span>
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{family.name}</h1>
          <p className="text-gray-700">{family.description_short}</p>
          <FamilyBuyBox
            familyName={family.name}
            schema={selectorAxes(family)}
            items={items}
            initialKey={preselected}
          />
          <section aria-labelledby="desc-h">
            <h2 id="desc-h" className="mb-2 text-lg font-semibold text-gray-900">Description</h2>
            <p className="whitespace-pre-line text-gray-700">{family.description_long}</p>
          </section>
          <p className="text-xs text-gray-500" data-testid="provenance">
            Provenance des prix : génération {meta.publication_id} / {meta.projection_id}, séquence {meta.catalogue_sequence} ({meta.data_label}),
            payload_sha256 <span className="font-mono">{meta.payload_sha256.slice(0, 12)}…</span>, instant serveur{" "}
            <span className="font-mono">{instant}</span>. Le prix retenu pour une quantité est sélectionné par le serveur (C0{" "}
            <span className="font-mono">selectPrice</span>), jamais calculé.
          </p>
        </div>
      </div>
    </div>
  );
}
