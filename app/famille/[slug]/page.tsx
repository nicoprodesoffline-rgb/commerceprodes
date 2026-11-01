import "@/components/product/product-sheet.css";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FamilyCard } from "@/components/home/family-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FamilyBuyBox } from "@/components/product/family-buy-box";
import { Gallery, type GalleryImage } from "@/components/product/gallery";
import { ProductCharacteristics, ProductDocuments, RelatedProducts, UpsellProducts } from "@/components/product/product-sections";
import { categoryCrumbs, familyCard, navigationOf } from "@/components/site/catalog-views";
import { CompareButton, WishlistButton } from "@/components/site/list-buttons";
import { RecentlyViewed } from "@/components/site/selection-views";
import { CarouselRow } from "@/components/site/carousel-row";
import { axesText, shownAxes } from "@/components/site/format";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import { catalogForPage } from "@/lib/site-catalog/page";
import { descriptionRest } from "@/lib/site-catalog/description";
import { shortRef } from "@/lib/site-catalog/short-ref";
import { priceRows, selectorAxes } from "@/lib/site-catalog/view";
import { getEditorialSet } from "@/lib/site-content/source";
import { relatedFamilies } from "@/lib/site-content/merchandising";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await catalogForPage();
  return { title: catalog.familyBySlug(slug)?.name ?? "Produit introuvable" };
}

/**
 * Fiche Famille-first (UX-P08/UX-P10, DA §1.3) : image principale de la Famille, nom, descriptions, puis la variante
 * (axes du DTO, combinaisons publiées seulement), sa référence `PI-…` (C0 §16.3 : affichée telle quelle), ses paliers
 * SELL sélectionnés par C0 à l'instant serveur. Tout vient du DTO de la génération servie.
 */
export default async function FamilyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ article?: string | string[] }> }) {
  const { slug } = await params;
  const { article } = await searchParams;
  // Le script de données structurées porte le nonce de la requête (CSP : aucun script en ligne sans nonce).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const catalog = await catalogForPage();
  const family = catalog.familyBySlug(slug);
  if (!family) notFound();
  const instant = serverNowUtc();
  const labels = new Map(family.axes.map((a) => [a.axis_key, a.label]));
  const items = family.items.map((i) => ({
    public_item_key: i.public_item_key,
    variant_axes: i.variant_axes,
    axes: shownAxes(family.axes.map((a) => ({ label: labels.get(a.axis_key) ?? a.axis_key, value: i.variant_axes[a.axis_key] ?? "" }))), // sans « pas de valeur » (option, accessoire)
    image_sha256: i.public_media_refs[0] ?? null,
    rows: priceRows(catalog.c0Generation, i, instant),
  }));
  const preselected = typeof article === "string" && items.some((i) => i.public_item_key === article) ? article : undefined;
  // Revue BC3 F-06 : une référence demandée mais non portée par cette Famille n'est jamais remplacée en silence.
  let notice: { text: string; link?: { href: string; label: string } } | null = null;
  if (typeof article === "string" && preselected === undefined) {
    const shown = shortRef(article.slice(0, 40));
    const r = /^PI-[0-9A-HJKMNP-TV-Z]{9}$/.test(article) ? catalog.resolveItem(article) : ({ kind: "ABSENT" } as const);
    if (r.kind === "SUPERSEDED") notice = { text: `La référence ${shown} a été remplacée.`, link: { href: `/article/${r.superseded_by}`, label: `Voir la nouvelle référence ${shortRef(r.superseded_by)}` } };
    else if (r.kind === "RETIRED") notice = { text: `La référence ${shown} a été retirée du catalogue et n'est plus proposée.` };
    else if (r.kind === "PUBLISHED") notice = { text: `La référence ${shown} correspond à un autre produit (${r.family.name}).`, link: { href: `/article/${article}`, label: "Voir cette référence" } };
    else notice = { text: `La référence ${shown} est inconnue du catalogue actuel.` };
  }

  const images: GalleryImage[] = [{ sha256: family.image_main_sha256, caption: "Vue principale" }];
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

  const byKey = new Map(catalog.families.map(f => [f.public_family_key, f]));
  const relations = relatedFamilies(await getEditorialSet(), family.public_family_key, new Set(byKey.keys()));
  const cards = (keys: string[]) => keys.map(key => byKey.get(key)!).map(f => ({ ...familyCard(f), from: familyPrice(catalog, f, instant) }));
  const complementaryCards = cards(relations.complementary);
  const upsellCards = cards(relations.upsell);
  const shown = new Set([...relations.complementary, ...relations.upsell]);
  // « Produits similaires » : même catégorie, hors familles déjà affichées (ordre du DTO), 8 au plus.
  const similar = catalog.families.filter((f) => f.slug !== family.slug && !shown.has(f.public_family_key) && f.primary_category_key === family.primary_category_key).slice(0, 8);
  const similarCards = similar.map((f) => ({ ...familyCard(f), from: familyPrice(catalog, f, instant) }));
  // Le texte court est sous le prix ; l'onglet « Description » ne reprend pas ce qu'il répète.
  const longText = descriptionRest(family.description_short ?? "", family.description_long ?? "");
  const crumbs = [{ label: "Accueil", href: "/" }, ...categoryCrumbs(catalog, family.primary_category_key), { label: family.name }];
  // Données structurées « Fil d'Ariane » : chevrons échappés pour qu'aucune valeur ne puisse fermer la balise.
  const breadcrumbLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...("href" in c && c.href ? { item: c.href } : {}) })),
  }).replace(/</g, "\\u003c");
  // Sur mobile la barre collante « Ajouter au panier » (48 px, à 72 px du bas) et la barre de navigation recouvrent le bas de page : on réserve leur hauteur (pb-40).
  return (
    <div className="min-w-0 pb-40 lg:pb-0">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: breadcrumbLd }} />
      <Breadcrumbs items={crumbs} />
      <FamilyBuyBox
        className="lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]"
        familyName={family.name}
        familySlug={family.slug}
        description={family.description_short}
        schema={selectorAxes(family)}
        items={items}
        initialKey={preselected}
        gallery={<Gallery familyName={family.name} images={images} />}
        notice={notice && (
          <div role="status" className="mb-6 border border-caution bg-white p-4 text-sm" data-testid="article-notice">
            <p className="font-semibold">{notice.text}</p>
            <p className="mt-1 text-ink-2">Nous affichons une autre variante de ce produit. Vérifiez la référence avant de l’ajouter au panier.</p>
            {notice.link && (
              <Link href={notice.link.href} className="mt-1 inline-flex min-h-[44px] items-center font-medium underline">{notice.link.label}</Link>
            )}
          </div>
        )}
      >
        <div className="product-list-links mt-6 flex flex-wrap gap-x-6 border-t border-line pt-4 print:hidden" data-testid="family-lists">
          <WishlistButton slug={family.slug} name={family.name} />
          <CompareButton slug={family.slug} name={family.name} />
        </div>
        <div className="mt-4 border-t border-line pt-4 text-sm text-ink-2 [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:items-center">
          {secondary.length > 0 && (
            <p data-testid="secondary-categories">
              Également dans :{" "}
              {secondary.map((c, n) => (
                <span key={c.key}>
                  {n > 0 && ", "}
                  <Link href={`/categorie/${c.key}`} className="underline">{c.name}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
      </FamilyBuyBox>
      {longText !== "" && (
        <section aria-labelledby="desc-h" className="mt-12 border-t border-line pb-4">
          <div className="mb-8 flex justify-center border-b border-line">
            <h2 id="desc-h" className="border-b-2 border-[color:var(--color-brand,#a71c19)] px-7 py-4 text-sm font-semibold uppercase tracking-wide">Description</h2>
          </div>
          <p className="whitespace-pre-line leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{longText}</p>
        </section>
      )}
      {/* alimenté par un futur contrat */}
      <ProductCharacteristics items={undefined} />
      <ProductDocuments items={undefined} />
      <RelatedProducts items={complementaryCards} />
      <UpsellProducts items={upsellCards} />
      {similar.length > 0 && (
        <section aria-labelledby="similar-h" className="mt-12 min-w-0 border-t border-line pt-8 print:hidden" data-testid="similar-families">
          <h2 id="similar-h" className="mb-6 text-xl font-semibold uppercase sm:text-2xl">Produits similaires</h2>
          <CarouselRow label="Produits similaires">
            {similarCards.map((f) => <FamilyCard key={f.slug} data={f} from={f.from} />)}
          </CarouselRow>
        </section>
      )}
      <div className="print:hidden"><RecentlyViewed slug={family.slug} /></div>
    </div>
  );
}
