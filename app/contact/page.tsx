import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const metadata: Metadata = { title: "Nous contacter" };

/**
 * Contact provisoire (V-E11) : présentation, horaires validés (C5) et la demande de devis, seule voie de contact qui existe sur le site. Aucun téléphone, aucune adresse e-mail,
 * aucune adresse postale en dur : les coordonnées sont pilotées depuis la Factory (S4) et ne sont pas encore validées. Rien n'est promis qui n'existe pas (pas de formulaire fantôme).
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Nous contacter" }]} />
      <h1 className="text-2xl font-semibold">Nous contacter</h1>
      <section className="space-y-3 rounded-[14px] border border-line bg-white p-5" aria-labelledby="presentation">
        <h2 id="presentation" className="text-lg font-semibold">PRODES</h2>
        <p className="text-ink-2">Au service des collectivités : mobilier, signalisation et équipements pour les organismes publics.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-3">Horaires</dt>
          <dd>Lun–Sam 8h30–19h</dd>
          <dt className="text-ink-3">Livraison</dt>
          <dd>Incluse sur tout le catalogue</dd>
        </dl>
      </section>
      <section className="space-y-3 rounded-[14px] bg-surface p-5" aria-labelledby="devis-contact">
        <h2 id="devis-contact" className="text-lg font-semibold">Une question, un prix, un produit ?</h2>
        <p className="text-ink-2">Ajoutez les produits qui vous intéressent à votre panier, puis demandez votre devis : vous indiquez vos coordonnées et votre message, nous vous répondons rapidement.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/recherche" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-medium text-white">Voir le catalogue</Link>
          <Link href="/devis" className="inline-flex h-[42px] items-center rounded-[9px] border border-line-strong bg-white px-5 font-medium hover:bg-surface">Demander un devis</Link>
        </div>
      </section>
    </div>
  );
}
