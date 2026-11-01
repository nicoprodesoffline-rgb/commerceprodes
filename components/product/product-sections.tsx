import Link from "next/link";
import { FamilyCard } from "@/components/home/family-card";
import { CarouselRow } from "@/components/site/carousel-row";
import type { FamilyCardData } from "@/components/site/catalog-views";
import { visibleSectionItems } from "@/components/product/section-visibility";

export type ProductCharacteristic = { label: string; value: string };
export type ProductDocument = { label: string; href: string };
type SectionItems<T> = { items?: readonly T[] | null };

const sectionClass = "mt-12 min-w-0 border-t border-line pt-8";
const headingClass = "mb-6 text-xl font-semibold text-ink sm:text-2xl";

export function ProductCharacteristics({ items }: SectionItems<ProductCharacteristic>) {
  const visible = visibleSectionItems(items);
  if (!visible) return null;
  return (
    <section aria-labelledby="characteristics-h" className={sectionClass}>
      <h2 id="characteristics-h" className={headingClass}>Caractéristiques</h2>
      <dl className="max-w-4xl text-sm">
        {visible.map((item, index) => (
          <div key={`${item.label}-${index}`} className="grid gap-1 border-b border-line py-4 sm:grid-cols-2 sm:gap-6">
            <dt className="font-medium">{item.label}</dt>
            <dd className="whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ProductDocuments({ items }: SectionItems<ProductDocument>) {
  const visible = visibleSectionItems(items);
  if (!visible) return null;
  return (
    <section aria-labelledby="documents-h" className={sectionClass}>
      <h2 id="documents-h" className={headingClass}>Documents</h2>
      <ul className="space-y-2">
        {visible.map((item, index) => (
          <li key={`${item.href}-${index}`}>
            <Link href={item.href} className="inline-flex min-h-[44px] items-center text-signal underline underline-offset-4 [overflow-wrap:anywhere]">{item.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ items, title, id }: { items: readonly FamilyCardData[]; title: string; id: string }) {
  return (
    <section aria-labelledby={id} className={`${sectionClass} print:hidden`}>
      <h2 id={id} className={headingClass}>{title}</h2>
      <CarouselRow label={title}>
        {items.map((item) => <FamilyCard key={item.slug} data={item} />)}
      </CarouselRow>
    </section>
  );
}

export function RelatedProducts({ items }: SectionItems<FamilyCardData>) {
  const visible = visibleSectionItems(items);
  if (!visible) return null;
  return <ProductRow items={visible} title="Produits liés" id="related-h" />;
}

export function UpsellProducts({ items }: SectionItems<FamilyCardData>) {
  const visible = visibleSectionItems(items);
  if (!visible) return null;
  return <ProductRow items={visible} title="Pour compléter votre commande" id="upsell-h" />;
}
