import Link from "next/link";
import { CategoryGrid } from "@/components/home/category-grid";
import { FamilyCard } from "@/components/home/family-card";
import { BasisNotice } from "@/components/site/basis-notice";
import { familyCard, navigationOf } from "@/components/site/catalog-views";
import { uniformBasis } from "@/components/site/format";
import { MediaImage } from "@/components/site/media-image";
import type { Catalog } from "@/lib/site-catalog/catalog";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { familyPrice } from "@/lib/site-catalog/listing-price";
import type { EditorialPage, Section } from "@/lib/site-content/model";
import { isLocalLink } from "@/lib/site-content/validate";

type Data<T extends Section["type"]> = Extract<Section, { type: T }>["data"];
const heading = "mb-3 whitespace-pre-line text-xl font-semibold [overflow-wrap:anywhere]";

export function HeroSection({ data, first }: { data: Data<"hero">; first: boolean }) {
  const Heading = first ? "h1" : "h2";
  return (
    <section data-testid="section-hero" className="min-w-0 rounded-[14px] border border-line bg-white p-6 md:p-8">
      <Heading className="max-w-[30ch] whitespace-pre-line text-3xl font-semibold [overflow-wrap:anywhere]">{data.title}</Heading>
      {data.text && <p className="mt-4 max-w-[70ch] whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]">{data.text}</p>}
      {data.link && isLocalLink(data.link) && <Link href={data.link} className="mt-5 inline-flex min-h-[42px] items-center rounded-[9px] border border-line px-4 font-medium hover:bg-surface">{data.linkLabel ?? "Découvrir"}</Link>}
    </section>
  );
}

export function CategoryGridSection({ data, catalog }: { data: Data<"category_grid">; catalog: Catalog }) {
  const nav = navigationOf(catalog);
  const byKey = new Map(catalog.categories.map(c => [c.category_key, c]));
  const categories = data.categories.flatMap(key => {
    const category = byKey.get(key);
    return category ? [{ key, name: category.name, familyCount: nav.node(key)?.ownFamilyCount ?? catalog.familiesInCategory(key).length, children: [] }] : [];
  });
  if (categories.length !== data.categories.length || categories.length === 0) return null;
  return (
    <section data-testid="section-category-grid" className="min-w-0 [overflow-wrap:anywhere]">
      {data.title && <h2 className={heading}>{data.title}</h2>}
      <CategoryGrid categories={categories} />
    </section>
  );
}

export function FamilyCarouselSection({ data, catalog }: { data: Data<"product_carousel">; catalog: Catalog }) {
  const byKey = new Map(catalog.families.map(f => [f.public_family_key, f]));
  const families = data.families.flatMap(key => { const family = byKey.get(key); return family ? [family] : []; });
  if (families.length !== data.families.length || families.length === 0) return null;
  const now = serverNowUtc();
  const cards = families.map(f => ({ key: f.public_family_key, data: familyCard(f), from: familyPrice(catalog, f, now) }));
  // Même affichage de base fiscale que FamilyGrid prices, sans constante fiscale éditoriale.
  const basis = uniformBasis(cards.map(f => f.from?.basis).filter(b => b !== undefined));
  return (
    <section data-testid="section-product-carousel" className="min-w-0">
      {data.title && <h2 className={heading}>{data.title}</h2>}
      {basis.uniform && <div className="mb-3"><BasisNotice basis={basis.basis} /></div>}
      <ul aria-label={data.title || "Familles publiées"} tabIndex={0} className="grid w-full min-w-0 snap-x snap-mandatory auto-cols-[min(80vw,300px)] grid-flow-col gap-4 overflow-x-auto pb-3 [overflow-wrap:anywhere] [&>li]:snap-start">
        {cards.map(card => <FamilyCard key={card.key} data={card.data} from={card.from} showBasis={!basis.uniform} />)}
      </ul>
    </section>
  );
}

export function TextImageSection({ data }: { data: Data<"text_image"> }) {
  return (
    <section data-testid="section-text-image" className="grid min-w-0 items-center gap-6 md:grid-cols-2">
      <div className="min-w-0">
        {data.title && <h2 className={heading}>{data.title}</h2>}
        <p className="max-w-[70ch] whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]">{data.text}</p>
      </div>
      <div aria-hidden={data.imageAlt ? undefined : true} className="min-w-0"><MediaImage sha256={data.media_sha} alt={data.imageAlt ?? ""} className="aspect-[4/3] w-full rounded-[14px] border border-line" /></div>
    </section>
  );
}

export function PageSections({ page, catalog }: { page: EditorialPage; catalog: Catalog }) {
  return (
    <div className="w-full min-w-0 space-y-10">
      {page.sections.map((section, index) => {
        switch (section.type) {
          case "hero": return <HeroSection key={index} data={section.data} first={index === 0} />;
          case "category_grid": return <CategoryGridSection key={index} data={section.data} catalog={catalog} />;
          case "product_carousel": return <FamilyCarouselSection key={index} data={section.data} catalog={catalog} />;
          case "text_image": return <TextImageSection key={index} data={section.data} />;
        }
      })}
    </div>
  );
}
