import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";
import type { FamilyCardData } from "@/components/site/catalog-views";
import { money, price, uniformBasis } from "@/components/site/format";
import { CompareButton, WishlistButton } from "@/components/site/list-buttons";
import type { FamilyPrice } from "@/lib/site-catalog/listing";

/**
 * Carte Famille : image principale de la Famille d'abord (UX-P08), jamais achetable directement. Le prix est le plus bas prix unitaire que le serveur retient
 * (« à partir de ») ; sans prix retenu : « Sur devis ». La base fiscale est dite sur la ligne, ou une seule fois par l'écran quand toutes les lignes la partagent.
 */
export function FamilyCard({ data, note, from, category, showBasis = true }: { data: FamilyCardData; note?: string; from?: FamilyPrice | undefined; category?: string; showBasis?: boolean }) {
  return (
    <li className="flex list-none flex-col overflow-hidden min-w-0 rounded-sm border border-line bg-white hover:border-brand">
      <Link href={`/famille/${data.slug}`} className="group flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
        <div className="relative">
          <MediaImage sha256={data.imageSha} alt="" className="aspect-[4/3] w-full p-5" />
          <span className="absolute bottom-2 left-2 bg-white px-2 py-1 text-[11px] font-medium text-ink-2" data-testid="free-delivery">Livraison incluse</span>
        </div>
        <span className="flex flex-1 flex-col p-4">
          {category && <span className="mb-1 inline-block self-start rounded-md bg-signal-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-signal">{category}</span>}
          <span className="text-lg font-bold leading-snug text-ink group-hover:text-brand">{data.name}</span>
          <span className="mt-2 line-clamp-2 text-sm text-ink-2">{data.description}</span>
          {from !== undefined && (
            <span className="mt-4 text-base" data-testid="family-price">
              {from === null ? <span className="font-medium text-ink-2">Sur devis</span> : <><span className="text-ink-3">À partir de </span><span className="tabular font-semibold text-ink">{showBasis ? price(from.amount, from.basis) : money(from.amount)}</span></>}
            </span>
          )}
          <span className="mt-auto flex items-center justify-between pt-3 text-xs text-ink-3">
            <span>
              {data.variantCount === 1 ? "1 modèle" : `${data.variantCount} variantes`}
              {note ? ` · ${note}` : ""}
            </span>
            <span className="inline-flex min-h-11 items-center rounded-sm bg-brand px-3 font-semibold text-white group-hover:bg-brand-dark" aria-hidden="true">Découvrir →</span>
          </span>
        </span>
      </Link>
      <div className="mt-auto flex flex-wrap items-start gap-x-4 px-4 [&_button]:min-h-11 [&_button]:rounded-none [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-0 [&_button]:py-3 [&_button]:text-xs [&_button]:font-normal [&_button]:text-ink-2 [&_button:hover]:bg-transparent [&_button:hover]:text-brand [&_button[aria-pressed=true]]:underline" data-testid="card-actions">
        <CompareButton slug={data.slug} name={data.name} />
        <WishlistButton slug={data.slug} name={data.name} />
      </div>
    </li>
  );
}

export type FamilyGridItem = FamilyCardData & { from?: FamilyPrice; category?: string };

export function FamilyGrid({ families, label, notes, prices = false }: { families: FamilyGridItem[]; label: string; notes?: Record<string, string>; prices?: boolean }) {
  if (families.length === 0) return null;
  // Friction 14 : quand toutes les lignes affichées ont la même base « non précisée », le bandeau la dit une fois pour l'écran.
  const basis = prices ? uniformBasis(families.map((f) => (f.from ? f.from.basis : undefined)).filter((b) => b !== undefined)) : ({ uniform: false } as const);
  return (
    <>
      <ul aria-label={label} className="commerce-grid">
        {families.map((f) => (
          <FamilyCard key={f.slug} data={f} note={notes?.[f.slug]} from={prices ? (f.from ?? null) : undefined} category={f.category} showBasis={!basis.uniform} />
        ))}
      </ul>
    </>
  );
}
