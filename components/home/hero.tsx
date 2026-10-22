import Link from "next/link";

export default function Hero() {
  return (
    <section className="border-b border-gray-100 bg-gradient-to-br from-white to-[#fef9f9]">
      <div className="mx-auto max-w-screen-2xl px-4 py-14 lg:px-6 lg:py-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* Left — copy */}
          <div className="flex-1">
            <span className="inline-block mb-4 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-[#cc1818] tracking-wide uppercase">
              B2B · Prix HT · Données de démonstration
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 lg:text-5xl">
              Équipements pour collectivités
            </h1>
            <p className="mt-4 text-lg text-gray-600 max-w-lg">
              Catalogue de démonstration (STAGING_FIXTURE) : 3 familles, 7
              articles publiés. Devis et commande en simulation contractuelle.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#familles"
                className="inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
              >
                Voir le catalogue
              </Link>
              <Link
                href="/panier"
                className="inline-flex items-center rounded-lg border border-[#cc1818] px-6 py-3 text-sm font-semibold text-[#cc1818] hover:bg-red-50 transition-colors"
              >
                Voir le panier
              </Link>
            </div>
          </div>

          {/* Right — trust icons */}
          <div className="grid grid-cols-2 gap-4 lg:w-80">
            {[
              { icon: "🏛️", title: "Collectivités publiques", sub: "Mairies, régions, écoles" },
              { icon: "💶", title: "Prix HT affichés", sub: "Sélectionnés depuis le snapshot" },
              { icon: "📦", title: "Paliers de quantité", sub: "Fenêtres de vente publiées" },
              { icon: "🧪", title: "Devis / commande", sub: "SIMULATION — rien n'est enregistré" },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                <p className="text-xs text-[#cc1818] mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
