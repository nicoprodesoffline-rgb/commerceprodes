import Link from "next/link";
import { MediaImage } from "@/components/site/media-image";
import { count } from "@/components/site/format";
import { isLocalLink } from "@/lib/site-content/validate";
import type { CatalogBasis } from "@/lib/site-catalog/basis";

export function Hero({ references, imageSha, title, text, link, linkLabel }: { references: number; basis?: CatalogBasis; imageSha?: string | null; title?: string; text?: string; link?: string; linkLabel?: string }) {
  return (
    <section aria-labelledby="hero-titre" className="grid min-w-0 flex-1 bg-brand-subtle text-ink lg:min-h-[420px] lg:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]" data-testid="hero">
      <div className={`flex min-w-0 flex-col justify-center px-6 py-10 sm:p-10 ${imageSha ? "" : "lg:col-span-2 lg:px-12"}`}>
        <h1 id="hero-titre" className="max-w-[18ch] whitespace-pre-line text-[clamp(2rem,4vw,3.75rem)] font-extrabold leading-[1.08] tracking-tight text-brand [overflow-wrap:anywhere]">{title || "Équipements pour collectivités"}</h1>
        <p className="mt-6 max-w-[48ch] whitespace-pre-line text-base leading-relaxed [overflow-wrap:anywhere] sm:text-lg">{text || "Mobilier, signalisation et équipements pour accompagner vos projets."}</p>
        {references > 0 && <p className="mt-3 text-sm"><span className="tabular font-bold" data-testid="reference-count">{count(references)}</span> référence{references > 1 ? "s" : ""} au catalogue</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/recherche" className="inline-flex min-h-12 items-center justify-center rounded-sm bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark">Voir le catalogue</Link>
          <Link href="/devis" className="inline-flex min-h-12 items-center justify-center rounded-sm border border-brand px-5 py-3 font-semibold text-brand hover:bg-white">Demander un devis</Link>
        </div>
        {link && isLocalLink(link) && link !== "/recherche" && link !== "/devis" && <Link href={link} className="mt-4 inline-flex min-h-11 self-start items-center underline underline-offset-4">{linkLabel || "Découvrir"} →</Link>}
      </div>
      {imageSha && <div className="min-w-0 bg-white p-6"><MediaImage sha256={imageSha} alt="" className="h-full min-h-64 w-full" /></div>}
    </section>
  );
}

export function TrustBar({ references, basis }: { references: number; basis?: CatalogBasis }) {
  const items = ["Livraison incluse sur tout le catalogue", "Lun–Sam 8h30–19h", ...(basis === "HT" ? ["Prix HT"] : [])];
  if (references === 0) return null;
  return (
    <ul aria-label="En bref" className="flex flex-col justify-center gap-x-12 gap-y-3 border-b border-line py-5 text-sm text-ink-2 sm:flex-row sm:flex-wrap" data-testid="trust-bar">
      {items.map(t => <li key={t} className="flex items-center gap-2"><span aria-hidden="true" className="font-bold text-brand">✓</span>{t}</li>)}
    </ul>
  );
}

export function QuoteBanner() {
  return (
    <section aria-labelledby="devis-bandeau" className="flex flex-col items-start justify-between gap-6 border-y border-line bg-brand-subtle px-6 py-8 sm:flex-row sm:items-center lg:px-10" data-testid="quote-banner">
      <div>
        <h2 id="devis-bandeau" className="text-2xl font-extrabold text-brand">Votre projet, votre devis</h2>
        <p className="mt-2 max-w-xl text-ink-2">Sélectionnez vos produits et leurs quantités pour préparer votre demande.</p>
      </div>
      <Link href="/devis" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-sm bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark">Demander un devis →</Link>
    </section>
  );
}

export function ProIntensBlock({ category }: { category: { key: string; name: string } | null }) {
  if (!category) return null;
  return (
    <section aria-labelledby="pro-intens" className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-6" data-testid="pro-intens-block">
      <h2 id="pro-intens" className="commerce-section-title">{category.name}</h2>
      <Link href="/gamme-pro-intens" className="inline-flex min-h-12 items-center px-3 font-semibold text-brand underline underline-offset-4">Voir la gamme →</Link>
    </section>
  );
}
