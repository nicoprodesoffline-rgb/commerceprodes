import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";
import type { FamilyCardData } from "@/components/site/catalog-views";

/** Carte Famille : image principale de la Famille d'abord (UX-P08), jamais achetable directement. */
export function FamilyCard({ data, note }: { data: FamilyCardData; note?: string }) {
  return (
    <li className="list-none">
      <Link href={`/famille/${data.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-white hover:border-ink-3">
        <MediaImage sha256={data.imageSha} alt="" className="aspect-[4/3] w-full [image-rendering:pixelated]" />
        <span className="flex flex-1 flex-col p-4">
          <span className="font-semibold text-ink group-hover:underline">{data.name}</span>
          <span className="mt-1 text-sm text-ink-2">{data.description}</span>
          <span className="mt-auto pt-3 text-xs text-ink-3">
            {data.variantCount === 1 ? "1 modèle" : `${data.variantCount} variantes`}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function FamilyGrid({ families, label, notes }: { families: FamilyCardData[]; label: string; notes?: Record<string, string> }) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {families.map((f) => (
        <FamilyCard key={f.slug} data={f} note={notes?.[f.slug]} />
      ))}
    </ul>
  );
}
