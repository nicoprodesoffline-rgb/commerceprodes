import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getShopSettings } from "@/lib/site-shop/source";
import { PageSections } from "@/components/content/sections";
import { publishedAt } from "@/components/content/published-page";
import { catalogForPage } from "@/lib/site-catalog/page";
import { MessageForm, type AboutProduct } from "@/components/contact/message-form";

export const metadata: Metadata = { title: "Nous contacter" };

/**
 * Contact (V-E11, cercle 5 ligne 5.10) : présentation, horaires validés (C5) et le formulaire « Nous écrire », unique : coordonnées, message, et le produit concerné quand on vient d'une fiche
 * (`?produit=<adresse de la famille>`, cherchée dans le catalogue servi). Aucun téléphone, aucune adresse e-mail, aucune adresse postale en dur : les coordonnées sont pilotées depuis la Factory (S4).
 */
export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { produit } = await searchParams;
  const shop = await getShopSettings();
  // « Une question sur ce produit » : la fiche d'où l'on vient (sa famille est cherchée dans le catalogue servi : jamais un nom ni une adresse venus du visiteur).
  let about: AboutProduct | null = null;
  if (typeof produit === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(produit) && produit.length <= 120) {
    const family = (await catalogForPage())?.familyBySlug(produit) ?? null;
    if (family !== null) about = { label: family.name, url: `/famille/${family.slug}`, public_item_key: null };
  }
  const edited = await publishedAt("/contact");   // cercle 3, 3.24 : le texte de contact publié par la Factory, au-dessus des coordonnées des réglages
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Nous contacter" }]} />
      <h1 className="text-2xl font-semibold">Nous contacter</h1>
      {edited && <PageSections page={{ ...edited, sections: edited.sections.filter(s => s.type !== "hero") }} catalog={await catalogForPage()} />}
      <section className="space-y-3 rounded-[14px] border border-line bg-white p-5" aria-labelledby="presentation">
        <h2 id="presentation" className="text-lg font-semibold">PRODES</h2>
        <p className="text-ink-2">Au service des collectivités : mobilier, signalisation et équipements pour les organismes publics.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-3">Horaires</dt>
          <dd>{shop.openingHours}</dd>
          <dt className="text-ink-3">Livraison</dt>
          <dd>{shop.deliveryNotice}</dd>
          {shop.phone && <><dt className="text-ink-3">Téléphone</dt><dd data-testid="shop-phone">{shop.phone}</dd></>}
          {shop.email && <><dt className="text-ink-3">E-mail</dt><dd data-testid="shop-email">{shop.email}</dd></>}
          {shop.address && <><dt className="text-ink-3">Adresse</dt><dd className="whitespace-pre-line" data-testid="shop-address">{shop.address}</dd></>}
        </dl>
      </section>
      <section className="space-y-3 rounded-[14px] border border-line bg-white p-5" aria-labelledby="nous-ecrire-h">
        <h2 id="nous-ecrire-h" className="text-lg font-semibold">Nous écrire</h2>
        <p className="text-ink-2">Une question, un prix, un produit ? Écrivez-nous : nous vous répondons rapidement.</p>
        <MessageForm product={about} />
      </section>
      <section className="space-y-3 rounded-[14px] bg-surface p-5" aria-labelledby="devis-contact">
        <h2 id="devis-contact" className="text-lg font-semibold">Un devis pour plusieurs produits ?</h2>
        <p className="text-ink-2">Ajoutez les produits qui vous intéressent à votre panier, puis demandez votre devis : vous indiquez vos coordonnées et votre message.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/recherche" className="inline-flex h-[44px] items-center rounded-[9px] bg-brand hover:bg-brand-dark px-5 font-medium text-white">Voir le catalogue</Link>
          <Link href="/devis" className="inline-flex h-[44px] items-center rounded-[9px] border border-line-strong bg-white px-5 font-medium hover:bg-surface">Demander un devis</Link>
        </div>
      </section>
    </div>
  );
}
