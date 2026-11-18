import Image from "next/image";
import Link from "next/link";
import type { CatalogBasis } from "@/lib/site-catalog/basis";
import type { CatalogMeta } from "@/lib/site-catalog/catalog";
import { DEFAULT_SHOP, type ShopSettings } from "@/lib/site-shop/settings";

export function SiteFooter({ meta, shop = DEFAULT_SHOP }: { meta: CatalogMeta | null; basis: CatalogBasis; shop?: ShopSettings }) {
  return (
    <footer className="mt-16 bg-ink text-sm text-white print:hidden">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 md:grid-cols-3 lg:px-8">
        <div>
          <Link href="/" aria-label="PRODES — accueil du catalogue" className="inline-flex min-h-12 items-center gap-3 text-[28px] font-extrabold tracking-tight">
            <Image src="/logo-prodes.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" />
            <span>PRODES</span>
          </Link>
          <p className="mt-5 max-w-xs text-white/80">Mobilier, signalisation et équipements pour les collectivités.</p>
          {!meta && <p className="mt-4" data-testid="unavailable-banner">Catalogue momentanément indisponible.</p>}
        </div>
        <nav aria-label="Liens du pied de page">
          <h2 className="mb-3 text-base font-bold uppercase">Votre catalogue</h2>
          <ul className="grid grid-cols-2 gap-x-4">
            <li><Link href="/recherche" className="inline-flex min-h-11 items-center hover:underline">Catalogue</Link></li>
            <li><Link href="/panier" className="inline-flex min-h-11 items-center hover:underline">Panier</Link></li>
            <li><Link href="/favoris" className="inline-flex min-h-11 items-center hover:underline">Ma sélection</Link></li>
            <li><Link href="/comparer" className="inline-flex min-h-11 items-center hover:underline">Comparateur</Link></li>
            <li><Link href="/devis" className="inline-flex min-h-11 items-center hover:underline">Demande de devis</Link></li>
            <li><Link href="/recu" className="inline-flex min-h-11 items-center hover:underline">Consulter un reçu</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-base font-bold uppercase">À votre écoute</h2>
          <p>{shop.openingHours}</p>
          <p className="mt-3 text-white/80">{shop.deliveryNotice}</p>
          {shop.phone && <p className="mt-3" data-testid="shop-phone">{shop.phone}</p>}
          {shop.email && <p data-testid="shop-email">{shop.email}</p>}
          {shop.address && <p className="mt-3 whitespace-pre-line text-white/80" data-testid="shop-address">{shop.address}</p>}
          <Link href="/contact" className="mt-3 inline-flex min-h-11 items-center underline underline-offset-4">Nous contacter</Link>
        </div>
      </div>
      <div className="border-t border-white/20">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 px-4 py-3 text-xs lg:px-8">
          <p>© PRODES — Tous droits réservés</p>
          <nav aria-label="Informations pratiques" className="flex flex-wrap gap-x-6">
            <Link href="/faq" className="inline-flex min-h-11 items-center px-2 hover:underline">FAQ</Link>
            <Link href="/mentions-legales" className="inline-flex min-h-11 items-center hover:underline">Mentions légales</Link>
            <Link href="/conditions-generales-de-vente" className="inline-flex min-h-11 items-center hover:underline">Conditions générales de vente</Link>
            <Link href="/confidentialite" className="inline-flex min-h-11 items-center hover:underline">Confidentialité</Link>
            {shop.footerLinks.map(l => <Link key={l.url + l.label} href={l.url} className="inline-flex min-h-11 items-center hover:underline">{l.label}</Link>)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
