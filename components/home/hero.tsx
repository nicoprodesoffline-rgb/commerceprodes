import Link from "next/link";

export default function Hero() {
  return (
    <section className="border-b border-gray-100 bg-gradient-to-br from-white to-[#fef9f9]">
      <div className="mx-auto max-w-screen-2xl px-4 py-14 lg:px-6 lg:py-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* Left — copy */}
          <div className="flex-1">
            <span className="inline-block mb-4 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-[#cc1818] tracking-wide uppercase">
              B2B · Prix HT · Devis gratuit
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 lg:text-5xl">
              Équipements pour collectivités
            </h1>
            <p className="mt-4 text-lg text-gray-600 max-w-lg">
              Mobilier, signalisation, sport — livraison directe aux organismes
              publics. Catalogue de 983 références.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/search"
                className="inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
              >
                Voir le catalogue
              </Link>
              <Link
                href="/search"
                className="inline-flex items-center rounded-lg border border-[#cc1818] px-6 py-3 text-sm font-semibold text-[#cc1818] hover:bg-red-50 transition-colors"
              >
                Demander un devis
              </Link>
            </div>
          </div>

          {/* Right — trust icons */}
          <div className="grid grid-cols-2 gap-4 lg:w-80">
            {[
              { icon: "🚚", title: "Livraison rapide", sub: "France métropolitaine" },
              { icon: "🏛️", title: "Collectivités publiques", sub: "Mairies, régions, écoles" },
              { icon: "💶", title: "Prix HT garantis", sub: "Facturation directe" },
              { icon: "📄", title: "Devis sous 24h", sub: "Réponse rapide" },
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
