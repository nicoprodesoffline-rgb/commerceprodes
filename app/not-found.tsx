import Link from "next/link";
import Footer from "components/layout/footer";

export default function NotFound() {
  return (
    <>
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-8xl font-black text-[#cc1818]">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          Cette page n&apos;existe pas ou a été déplacée.
        </h1>
        <p className="mt-2 max-w-sm text-gray-500">
          Le lien que vous avez suivi est peut-être incorrect ou la page a été supprimée.
        </p>

        {/* Barre de recherche */}
        <form
          action="/search"
          method="GET"
          className="mt-8 flex w-full max-w-sm gap-2"
        >
          <input
            name="q"
            type="search"
            placeholder="Rechercher un produit…"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#cc1818] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
            aria-label="Rechercher"
          >
            🔍
          </button>
        </form>

        {/* Suggestions rapides */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/search"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
          >
            Voir le catalogue
          </Link>
          <Link
            href="/devis-express"
            className="rounded-lg bg-[#cc1818] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            📋 Demander un devis
          </Link>
          <Link
            href="/contact"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
          >
            Nous contacter
          </Link>
        </div>

        <p className="mt-10 text-sm text-gray-400">
          📞{" "}
          <a href="tel:+33467243034" className="hover:text-[#cc1818]">
            04 67 24 30 34
          </a>{" "}
          · Lun–Sam 8h30–19h
        </p>
      </div>
      <Footer />
    </>
  );
}
