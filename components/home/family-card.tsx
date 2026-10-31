import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";
import type { FamilyCardData } from "@/components/site/catalog-views";
import { money, price, uniformBasis } from "@/components/site/format";
import { BasisNotice } from "@/components/site/basis-notice";
import { CompareButton, WishlistButton } from "@/components/site/list-buttons";
import type { FamilyPrice } from "@/lib/site-catalog/listing";

/**
 * Carte Famille : image principale de la Famille d'abord (UX-P08), jamais achetable directement. Le prix est le plus bas prix unitaire que le serveur retient
 * (« à partir de ») ; sans prix retenu : « Sur devis ». La base fiscale est dite sur la ligne, ou une seule fois par l'écran quand toutes les lignes la partagent.
 */
export function FamilyCard({ data, note, from, category, showBasis = true }: { data: FamilyCardData; note?: string; from?: FamilyPrice | undefined; category?: string; showBasis?: boolean }) {
  return (
    <li className="flex list-none flex-col overflow-hidden rounded-[14px] border border-line bg-white hover:border-ink-3">
      <Link href={`/famille/${data.slug}`} className="group flex flex-1 flex-col">
        <div className="relative">
          <MediaImage sha256={data.imageSha} alt="" className="aspect-[4/3] w-full [image-rendering:pixelated]" />
          <span className="absolute bottom-2 left-2 rounded-full bg-positive px-2.5 py-0.5 text-[11px] font-semibold text-white" data-testid="free-delivery">Livraison incluse</span>
        </div>
        <span className="flex flex-1 flex-col p-4">
          {category && <span className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{category}</span>}
          <span className="font-semibold text-ink group-hover:underline">{data.name}</span>
          <span className="mt-1 text-sm text-ink-2">{data.description}</span>
          {from !== undefined && (
            <span className="mt-2 text-sm" data-testid="family-price">
              {from === null ? <span className="font-medium text-ink-2">Sur devis</span> : <><span className="text-ink-3">À partir de </span><span className="tabular font-semibold text-ink">{showBasis ? price(from.amount, from.basis) : money(from.amount)}</span></>}
            </span>
          )}
          <span className="mt-auto flex items-center justify-between pt-3 text-xs text-ink-3">
            <span>
              {data.variantCount === 1 ? "1 modèle" : `${data.variantCount} variantes`}
              {note ? ` · ${note}` : ""}
            </span>
            <span className="font-medium text-ink-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">Voir le produit →</span>
          </span>
        </span>
      </Link>
      <div className="flex flex-wrap items-start gap-2 px-4 pb-4" data-testid="card-actions">
        <CompareButton slug={data.slug} name={data.name} />
        <WishlistButton slug={data.slug} name={data.name} />
      </div>
    </li>
  );
}

export type FamilyGridItem = FamilyCardData & { from?: FamilyPrice; category?: string };

export function FamilyGrid({ families, label, notes, prices = false }: { families: FamilyGridItem[]; label: string; notes?: Record<string, string>; prices?: boolean }) {
  // Friction 14 : quand toutes les lignes affichées ont la même base « non précisée », le bandeau la dit une fois pour l'écran.
  const basis = prices ? uniformBasis(families.map((f) => (f.from ? f.from.basis : undefined)).filter((b) => b !== undefined)) : ({ uniform: false } as const);
  return (
    <>
      {basis.uniform && <div className="mb-3"><BasisNotice basis={basis.basis} /></div>}
      <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {families.map((f) => (
          <FamilyCard key={f.slug} data={f} note={notes?.[f.slug]} from={prices ? (f.from ?? null) : undefined} category={f.category} showBasis={!basis.uniform} />
        ))}
      </ul>
    </>
  );
}
