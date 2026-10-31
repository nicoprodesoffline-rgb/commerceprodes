import Link from "next/link";

/** Page introuvable (V-E20) : le message historique, une recherche et deux suites utiles ; jamais de page générique du framework. */
export default function NotFound() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-2 py-12 text-center" data-testid="not-found">
      <p className="text-7xl font-black tracking-tight text-signal" aria-hidden="true">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 max-w-md text-ink-2">Cette adresse ne correspond à aucune page ni à aucun article du catalogue publié. Le lien suivi est peut-être incorrect.</p>
      <form role="search" action="/recherche" method="get" className="mt-6 flex w-full max-w-sm gap-2">
        <label htmlFor="q-404" className="sr-only">Rechercher une famille de produits</label>
        <input id="q-404" name="q" type="search" maxLength={100} placeholder="Rechercher (nom de famille)" className="h-[42px] min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white px-3" />
        <button type="submit" className="h-[42px] shrink-0 rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface">Rechercher</button>
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/recherche" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Voir le catalogue</Link>
        <Link href="/devis" className="inline-flex h-[42px] items-center rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface">Demander un devis</Link>
      </div>
    </div>
  );
}
