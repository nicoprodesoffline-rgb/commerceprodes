import Link from "next/link";
import { NEUTRAL_BASIS_TEXT, type CatalogBasis } from "@/lib/site-catalog/basis";

/**
 * Bandeau d'accroche de l'accueil (V-E01-01/02/03) : promesses limitées aux textes validés par le propriétaire — livraison incluse (C1), prix HT seulement si la génération le déclare, réponse
 * rapide aux devis sans délai chiffré (C3). « Catalogue de N références » : N = nombre de variantes publiées, compté par le serveur (C6).
 */
export function Hero({ references, basis }: { references: number; basis: CatalogBasis }) {
  const cards = [
    { title: "Livraison incluse", sub: "Sur tout le catalogue" },
    { title: "Collectivités publiques", sub: "Mairies, régions, écoles" },
    basis === "HT" ? { title: "Prix HT", sub: "La TVA apparaît sur le devis et la facture" } : { title: "Prix et base fiscale", sub: "Précisés sur le devis" },
    { title: "Devis", sub: "Nous vous répondons rapidement" },
  ];
  return (
    <section aria-labelledby="hero-titre" className="rounded-[14px] border border-line bg-white" data-testid="hero">
      <div className="flex flex-col gap-8 p-6 lg:flex-row lg:items-center lg:gap-14 lg:p-10">
        <div className="flex-1">
          <p className="mb-3 inline-block rounded-full bg-signal-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-signal">{basis === "HT" ? "Collectivités · Prix HT · Livraison incluse" : "Collectivités · Livraison incluse"}</p>
          <h1 id="hero-titre" className="text-3xl font-bold tracking-tight lg:text-4xl">Équipements pour collectivités</h1>
          <p className="mt-3 max-w-lg text-lg text-ink-2">
            Mobilier, signalisation et équipements pour les organismes publics. Catalogue de <span className="tabular font-semibold text-ink" data-testid="reference-count">{references}</span> référence{references > 1 ? "s" : ""}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/recherche" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-medium text-white">Voir le catalogue</Link>
            <Link href="/devis" className="inline-flex h-[42px] items-center rounded-[9px] border border-ink bg-white px-5 font-medium text-ink hover:bg-surface">Demander un devis</Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:w-96" aria-label="Nos engagements">
          {cards.map((c) => (
            <li key={c.title} className="rounded-[14px] border border-line bg-surface p-4">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-0.5 text-xs text-ink-2">{c.sub}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Bande de réassurance (V-E01-04) : quatre faits, aucun n'est une promesse non validée (pas de délai, pas de moyen de paiement). */
export function TrustBar({ references, basis }: { references: number; basis: CatalogBasis }) {
  const items = [`${references} référence${references > 1 ? "s" : ""} publiée${references > 1 ? "s" : ""}`, "Livraison incluse sur tout le catalogue", basis === "HT" ? "Prix HT : TVA sur le devis et la facture" : NEUTRAL_BASIS_TEXT.replace(/\.$/, ""), "Lun–Sam 8h30–19h"];
  return (
    <ul aria-label="En bref" className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-sm text-ink-2 sm:flex-row sm:justify-around" data-testid="trust-bar">
      {items.map((t) => <li key={t} className="flex items-center gap-2"><span aria-hidden="true" className="font-bold text-positive">✓</span>{t}</li>)}
    </ul>
  );
}

/** Appel au devis (V-E01-10) : un lien vers la demande de devis qui existe. */
export function QuoteBanner() {
  return (
    <section aria-labelledby="devis-bandeau" className="flex flex-col items-start justify-between gap-3 rounded-[14px] bg-ink px-6 py-5 text-white sm:flex-row sm:items-center" data-testid="quote-banner">
      <div>
        <h2 id="devis-bandeau" className="text-lg font-semibold">Besoin d&apos;un devis personnalisé ?</h2>
        <p className="text-sm text-white/70">Composez votre panier, puis demandez votre devis : nous vous répondons rapidement.</p>
      </div>
      <Link href="/devis" className="inline-flex h-[42px] shrink-0 items-center rounded-[9px] bg-white px-5 font-medium text-ink">Demander un devis →</Link>
    </section>
  );
}

/** Gamme PRO-INTENS (C11) : rendue seulement si la Factory publie une catégorie de ce nom ; sinon rien (aucune gamme inventée). */
export function ProIntensBlock({ category }: { category: { key: string; name: string } | null }) {
  if (category === null) return null;
  return (
    <section aria-labelledby="pro-intens" className="rounded-[14px] bg-ink px-6 py-6 text-white" data-testid="pro-intens-block">
      <p className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">★ Gamme exclusive</p>
      <h2 id="pro-intens" className="text-xl font-semibold">{category.name}</h2>
      <Link href="/gamme-pro-intens" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-white px-5 font-medium text-ink">Voir la gamme →</Link>
    </section>
  );
}
