import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FamilyBuyBox } from "@/components/product/family-buy-box";
import { getCategories, getFamilyBySlug, getSnapshotMeta, nowUtc } from "@/lib/site-dto";
import { priceRows, unavailableCombinations } from "@/lib/site-dto/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const f = getFamilyBySlug((await params).slug);
  return { title: f?.name ?? "Famille introuvable" };
}

export default async function FamilyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const family = getFamilyBySlug(slug);
  if (!family) notFound();
  const instant = nowUtc();
  const meta = getSnapshotMeta();
  const cat = getCategories().find((c) => c.category_key === family.primary_category_key);
  const items = family.items.map((i) => ({
    public_item_key: i.public_item_key,
    variant_axes: i.variant_axes,
    image_sha256: i.media.find((m) => m.role === "main")?.sha256 ?? i.media[0]?.sha256 ?? null,
    rows: priceRows(i.windows, instant),
  }));

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
          {family.image_main_sha256 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/media/${family.image_main_sha256}`}
              alt={`Image principale de la famille ${family.name}`}
              className="aspect-square w-full rounded-xl border border-gray-200 bg-white object-contain [image-rendering:pixelated]"
              data-testid="family-image"
            />
          ) : (
            <div className="aspect-square w-full rounded-xl bg-gray-100" aria-label="Pas d'image famille" />
          )}
        </div>
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Famille <span className="font-mono">{family.public_family_key}</span>
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{family.name}</h1>
          <p className="text-gray-700">{family.description_short}</p>
          <FamilyBuyBox
            familyName={family.name}
            schema={family.variant_axes_schema}
            items={items}
            unavailableNotes={unavailableCombinations(family)}
          />
          <section aria-labelledby="desc-h">
            <h2 id="desc-h" className="mb-2 text-lg font-semibold text-gray-900">Description</h2>
            <p className="whitespace-pre-line text-gray-700">{family.description_long}</p>
          </section>
          <p className="text-xs text-gray-500" data-testid="provenance">
            Provenance des prix : snapshot {meta.publication_id} / {meta.projection_id} ({meta.contract_version}), sha256{" "}
            <span className="font-mono">{meta.payload_sha256.slice(0, 12)}…</span>, instant de référence{" "}
            <span className="font-mono">{instant}</span>. Règle de sélection provisoire : une fenêtre PROMO active l&apos;emporte
            sur BASE.
          </p>
        </div>
      </div>
    </div>
  );
}
