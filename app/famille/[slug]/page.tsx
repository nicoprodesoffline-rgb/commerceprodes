import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FamilyBuyBox } from "@/components/product/family-buy-box";
import { Gallery, type GalleryImage } from "@/components/product/gallery";
import { categoryCrumbs, navigationOf } from "@/components/site/catalog-views";
import { axesText } from "@/components/site/format";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogForPage } from "@/lib/site-catalog/page";
import { priceRows, selectorAxes } from "@/lib/site-catalog/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await catalogForPage();
  return { title: catalog.familyBySlug(slug)?.name ?? "Famille introuvable" };
}

/**
 * Fiche Famille-first (UX-P08/UX-P10, DA §1.3) : image principale de la Famille, nom, descriptions, puis la variante
 * (axes du DTO, combinaisons publiées seulement), sa référence `PI-…` (C0 §16.3 : affichée telle quelle), ses paliers
 * SELL sélectionnés par C0 à l'instant serveur. Tout vient du DTO de la génération servie.
 */
export default async function FamilyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ article?: string | string[] }> }) {
  const { slug } = await params;
  const { article } = await searchParams;
  const catalog = await catalogForPage();
  const family = catalog.familyBySlug(slug);
  if (!family) notFound();
  const instant = serverNowUtc();
  const labels = new Map(family.axes.map((a) => [a.axis_key, a.label]));
  const items = family.items.map((i) => ({
    public_item_key: i.public_item_key,
    variant_axes: i.variant_axes,
    axes: family.axes.map((a) => ({ label: labels.get(a.axis_key) ?? a.axis_key, value: i.variant_axes[a.axis_key] ?? "" })),
    image_sha256: i.public_media_refs[0] ?? null,
    rows: priceRows(catalog.c0Generation, i, instant),
  }));
  const preselected = typeof article === "string" && items.some((i) => i.public_item_key === article) ? article : undefined;
  // Revue BC3 F-06 : une référence demandée mais non portée par cette Famille n'est jamais remplacée en silence.
  let notice: { text: string; link?: { href: string; label: string } } | null = null;
  if (typeof article === "string" && preselected === undefined) {
    const shown = article.slice(0, 40);
    const r = /^PI-[0-9A-HJKMNP-TV-Z]{9}$/.test(article) ? catalog.resolveItem(article) : ({ kind: "ABSENT" } as const);
    if (r.kind === "SUPERSEDED") notice = { text: `La référence ${shown} a été remplacée.`, link: { href: `/article/${r.superseded_by}`, label: `Voir la nouvelle référence ${r.superseded_by}` } };
    else if (r.kind === "RETIRED") notice = { text: `La référence ${shown} a été retirée du catalogue et n'est plus proposée.` };
    else if (r.kind === "PUBLISHED") notice = { text: `La référence ${shown} appartient à une autre famille (${r.family.name}).`, link: { href: `/article/${article}`, label: "Voir cette référence" } };
    else notice = { text: `La référence ${shown} est inconnue du catalogue actuel.` };
  }

  const images: GalleryImage[] = [{ sha256: family.image_main_sha256, caption: "Image principale de la famille" }];
  for (const i of items) {
    for (const sha of family.items.find((x) => x.public_item_key === i.public_item_key)!.public_media_refs) {
      if (!images.some((g) => g.sha256 === sha)) images.push({ sha256: sha, caption: `Variante ${axesText(i.axes)}` });
    }
  }
  // Rubriques navigables uniquement (un niveau 4+ est rattaché à son ancêtre de niveau 3), sans doublon ni la principale.
  const nav = navigationOf(catalog);
  const primaryAnchor = nav.anchor(family.primary_category_key);
  const secondary = [...new Set(family.secondary_category_keys.map((k) => nav.anchor(k)))]
    .filter((k): k is string => k !== null && k !== primaryAnchor)
    .map((k) => nav.node(k))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, family.primary_category_key), { label: family.name }]} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Gallery familyName={family.name} images={images} />
        <div className="min-w-0 space-y-5">
          <header>
            <p className="text-xs text-ink-3">Famille de produits · {family.items.length === 1 ? "1 modèle" : `${family.items.length} variantes`}</p>
            <h1 className="mt-1 text-2xl font-semibold">{family.name}</h1>
            <p className="mt-2 text-ink-2">{family.description_short}</p>
          </header>
          {notice && (
            <div role="status" className="rounded-[14px] border-2 border-caution bg-white p-4 text-sm" data-testid="article-notice">
              <p className="font-semibold">{notice.text}</p>
              <p className="mt-1 text-ink-2">La variante affichée ci-dessous est la première variante de cette famille, pas la référence demandée.</p>
              {notice.link && (
                <Link href={notice.link.href} className="mt-1 inline-flex min-h-[34px] items-center font-medium underline">{notice.link.label}</Link>
              )}
            </div>
          )}
          <FamilyBuyBox familyName={family.name} familySlug={family.slug} schema={selectorAxes(family)} items={items} initialKey={preselected} />
          <section aria-labelledby="desc-h">
            <h2 id="desc-h" className="mb-2 text-lg font-semibold">Description</h2>
            <p className="whitespace-pre-line text-ink-2">{family.description_long}</p>
          </section>
          {secondary.length > 0 && (
            <p className="text-sm text-ink-2" data-testid="secondary-categories">
              Également dans :{" "}
              {secondary.map((c, n) => (
                <span key={c.key}>
                  {n > 0 && ", "}
                  <Link href={`/categorie/${c.key}`} className="underline">{c.name}</Link>
                </span>
              ))}
            </p>
          )}
          <details className="text-xs text-ink-3" data-testid="provenance">
            <summary className="inline-flex min-h-[34px] cursor-pointer items-center">Provenance des prix</summary>
            <p className="mt-1">
              Version du catalogue {catalog.meta.catalogue_sequence} ({catalog.meta.data_label}), publication{" "}
              <span className="font-mono">{catalog.meta.publication_id}</span>, instant serveur <span className="font-mono">{instant}</span>. Chaque prix est
              sélectionné par le serveur dans les fenêtres publiées (contrat C0, <span className="font-mono">selectPrice</span>), jamais calculé.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
