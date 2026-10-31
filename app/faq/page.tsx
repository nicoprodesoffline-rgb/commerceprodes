import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { catalogBasis, NEUTRAL_BASIS_TEXT } from "@/lib/site-catalog/basis";
import { catalogOrNull } from "@/lib/site-catalog/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Questions fréquentes" };

type Qa = { q: string; a: React.ReactNode };

/**
 * FAQ provisoire (V-E13) : seules les réponses que le propriétaire a décidées sont écrites — livraison incluse (C1), réponse rapide aux devis sans délai chiffré (C3),
 * pas de délai de livraison général (C4), horaires (C5), pas de garantie générale (C7). Les réponses de l'ancien site sur le paiement, les délais de traitement, le minimum de
 * commande, l'annulation, l'installation ou les données ne sont pas reprises : aucune décision ne les porte. La base fiscale n'est dite que si la génération la déclare.
 */
export default async function FaqPage() {
  const catalog = await catalogOrNull();
  const basis = catalog ? catalogBasis(catalog.families, catalog.meta.payload_sha256) : "NOT_DECLARED";
  const groups: { title: string; items: Qa[] }[] = [
    {
      title: "Devis et commandes",
      items: [
        { q: "Comment obtenir un devis ?", a: <>Ajoutez les produits à votre panier, puis choisissez « Demander un devis » : vous indiquez vos coordonnées et, si vous le souhaitez, un message. Nous vous répondons rapidement. Vous pouvez aussi le demander directement depuis la fiche d&apos;un produit.</> },
        { q: "Quels sont vos horaires ?", a: <>Du lundi au samedi, de 8h30 à 19h.</> },
        { q: "Quelle est la base fiscale des prix ?", a: basis === "HT" ? <>Les prix publiés sont hors taxes ; la TVA apparaît sur le devis et la facture.</> : <>{NEUTRAL_BASIS_TEXT} Transport et remises ne sont pas calculés sur ce site.</> },
      ],
    },
    {
      title: "Livraison",
      items: [
        { q: "La livraison est-elle incluse dans les prix ?", a: <>Oui, la livraison est incluse sur tout le catalogue.</> },
        { q: "Dans quels délais suis-je livré ?", a: <>Aucun délai général n&apos;est annoncé. Le délai propre à un produit sera indiqué sur sa fiche lorsqu&apos;il est publié ; en attendant, demandez-le dans votre demande de devis.</> },
      ],
    },
    {
      title: "Produits",
      items: [
        { q: "Les produits sont-ils garantis ?", a: <>Aucune garantie générale n&apos;est annoncée. La garantie d&apos;un produit est indiquée sur sa fiche lorsque le fournisseur la donne.</> },
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Questions fréquentes" }]} />
      <h1 className="text-2xl font-semibold">Questions fréquentes</h1>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`g-${g.title}`}>
          <h2 id={`g-${g.title}`} className="mb-2 text-lg font-semibold">{g.title}</h2>
          <div className="divide-y divide-line rounded-[14px] border border-line bg-white">
            {g.items.map((it) => (
              // `name` commun : une seule question ouverte à la fois (accordéon natif, sans script).
              <details key={it.q} name="faq" className="group px-4">
                <summary className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 font-medium">{it.q}<span aria-hidden="true" className="text-ink-3 group-open:rotate-180">▾</span></summary>
                <div className="pb-4 text-ink-2">{it.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <section className="rounded-[14px] bg-surface p-5" data-testid="faq-help">
        <h2 className="text-lg font-semibold">Vous ne trouvez pas la réponse ?</h2>
        <p className="mt-1 text-ink-2">Écrivez-nous : nous vous répondons rapidement.</p>
        <Link href="/contact" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-medium text-white">Nous contacter →</Link>
      </section>
    </div>
  );
}
