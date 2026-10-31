import Image from "next/image";
import Link from "next/link";
import { NEUTRAL_BASIS_TEXT, type CatalogBasis } from "@/lib/site-catalog/basis";
import type { CatalogMeta } from "@/lib/site-catalog/catalog";

/**
 * Pied de page à trois colonnes comme l'historique (marque et baseline, liens rapides, horaires) et barre de mentions.
 * Textes validés par le propriétaire : horaires (C5), livraison incluse (C1), base fiscale dite seulement si la génération la déclare (HT). Aucune coordonnée en dur
 * (pilotées depuis la Factory, S4) et aucun lien vers une page qui n'existe pas encore. Le détail technique de la génération servie
 * reste en second niveau (`<details>`, DA §7).
 */
export function SiteFooter({ meta, instantUtc, forcedNow, basis }: { meta: CatalogMeta | null; instantUtc: string | null; forcedNow: boolean; basis: CatalogBasis }) {
  return (
    <footer className="mt-12 bg-ink text-sm text-white/80 print:hidden">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 md:grid-cols-3 lg:px-8">
        <div>
          <Link href="/" aria-label="PRODES — accueil du catalogue" className="inline-flex items-center gap-2.5 text-lg font-bold tracking-[0.08em] text-white">
            <Image src="/logo-prodes.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <span>PRODES</span>
          </Link>
          <p className="mt-3 text-white">Au service des collectivités</p>
          <p className="mt-2 text-xs text-white/60">Mobilier, signalisation et équipements pour les organismes publics.</p>
        </div>
        <nav aria-label="Liens du pied de page">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white">Liens rapides</h2>
          <ul className="space-y-1">
            <li><Link href="/recherche" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Catalogue</Link></li>
            <li><Link href="/panier" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Panier</Link></li>
            <li><Link href="/favoris" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Ma sélection</Link></li>
            <li><Link href="/comparer" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Comparateur</Link></li>
            <li><Link href="/devis" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Demande de devis</Link></li>
            <li><Link href="/recu" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Consulter un reçu</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white">Nous joindre</h2>
          <p>Lun–Sam 8h30–19h</p>
          <p className="mt-2">Livraison incluse sur tout le catalogue.</p>
          <p className="mt-2 text-xs text-white/60" data-testid="footer-basis">{basis === "HT" ? "Prix de vente PRODES hors taxes : la TVA apparaît sur le devis et la facture." : NEUTRAL_BASIS_TEXT} Transport et remises : non calculés sur ce site.</p>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-4 text-xs text-white/60 md:flex-row md:items-start md:justify-between lg:px-8">
          <p>© 2026 PRODES{basis === "HT" ? " — Prix HT" : ""} — Tous droits réservés</p>
          <details className="md:text-right">
            <summary className="inline-flex min-h-[34px] cursor-pointer items-center font-medium text-white/80">Détail technique</summary>
            {meta ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left">
                <dt>Données</dt>
                <dd className="font-mono">{meta.data_label}</dd>
                <dt>Publication</dt>
                <dd className="break-all font-mono">{meta.publication_id}</dd>
                <dt>Version du catalogue</dt>
                <dd className="font-mono" data-testid="catalogue-sequence">{meta.catalogue_sequence}</dd>
                <dt>Source</dt>
                <dd className="font-mono">{meta.source}</dd>
                <dt>Empreinte</dt>
                <dd className="font-mono">{meta.payload_sha256.slice(0, 12)}…</dd>
                <dt>Instant serveur</dt>
                <dd className="font-mono">
                  {forcedNow ? "instant figé " : ""}
                  {instantUtc ?? "indisponible"}
                </dd>
              </dl>
            ) : (
              <p className="mt-2" data-testid="unavailable-banner">Aucune génération de catalogue servable.</p>
            )}
          </details>
        </div>
      </div>
    </footer>
  );
}
