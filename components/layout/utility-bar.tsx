import Link from "next/link";

/**
 * Barre supérieure (niveau 1 de l'en-tête historique, V-E01 / T-T02) : horaires et promesse de livraison validés par le propriétaire
 * (C5 : lun–sam 8h30–19h ; C1 : livraison incluse sur tout le catalogue) et trois liens vers des pages qui existent.
 * Aucun numéro de téléphone ni adresse : les coordonnées sont pilotées depuis la Factory (S4), elles ne sont pas écrites en dur ici.
 */
export function UtilityBar() {
  return (
    <div className="bg-ink text-xs text-white" data-testid="utility-bar">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-1.5 lg:px-8">
        <p className="text-white/80">Lun–Sam 8h30–19h</p>
        <p className="hidden font-medium md:block">Livraison incluse sur tout le catalogue</p>
        <nav aria-label="Liens utiles" className="flex items-center gap-3">
          <Link href="/faq" className="hidden min-h-[24px] items-center hover:underline sm:inline-flex">FAQ</Link>
          <span aria-hidden="true" className="hidden text-white/40 sm:inline">|</span>
          <Link href="/contact" className="inline-flex min-h-[24px] items-center hover:underline">Nous contacter</Link>
          <span aria-hidden="true" className="text-white/40">|</span>
          <Link href="/recherche" className="hidden min-h-[24px] items-center hover:underline sm:inline-flex">Catalogue</Link>
          <span aria-hidden="true" className="hidden text-white/40 sm:inline">|</span>
          <Link href="/favoris" className="inline-flex min-h-[24px] items-center hover:underline">Ma sélection</Link>
          <span aria-hidden="true" className="hidden text-white/40 sm:inline">|</span>
          <Link href="/devis" className="hidden min-h-[24px] items-center hover:underline sm:inline-flex">Demande de devis</Link>
        </nav>
      </div>
    </div>
  );
}
