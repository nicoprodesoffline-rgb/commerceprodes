import Link from "next/link";
import type { CatalogMeta } from "@/lib/site-catalog/catalog";

/**
 * Pied de page : liens utiles et, en second niveau (`<details>`), le détail technique de la génération servie
 * (DA §7 : « Détail technique » en disclosure). Aucune coordonnée commerciale : non vérifiées (DA §2.2,
 * PENDING_ASSET_VERIFICATION) — le prototype portait un numéro et une adresse non qualifiés.
 */
export function SiteFooter({ meta, instantUtc, forcedNow }: { meta: CatalogMeta | null; instantUtc: string | null; forcedNow: boolean }) {
  return (
    <footer className="mt-12 border-t border-line bg-surface text-sm text-ink-2">
      <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-bold tracking-[0.08em] text-ink">PRODES</p>
          <p className="mt-1">Prix de vente PRODES publiés par le catalogue. Taxes et frais de port : non calculés sur ce site.</p>
        </div>
        <nav aria-label="Liens du pied de page">
          <ul className="space-y-1">
            <li><Link href="/" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Catalogue</Link></li>
            <li><Link href="/panier" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Panier</Link></li>
            <li><Link href="/recu" className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">Consulter un reçu</Link></li>
          </ul>
        </nav>
        <details className="text-xs">
          <summary className="inline-flex min-h-[34px] cursor-pointer items-center font-medium text-ink">Détail technique</summary>
          {meta ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
    </footer>
  );
}
