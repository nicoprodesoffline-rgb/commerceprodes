import Link from "next/link";

const cards = [
  {
    title: "Variantes produit",
    description: "Éditer les variantes existantes depuis les fiches produit et la vue Excel.",
    href: "/admin/produits",
  },
  {
    title: "Mères / Filles",
    description: "Assembler les structures famille et surveiller les dépendances de migration.",
    href: "/admin/familles",
  },
  {
    title: "Data factory",
    description: "Préparer les imports, la normalisation et les workflows PUID liés aux variantes.",
    href: "/admin/data-factory",
  },
];

export default function AdminVariationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
          BÊTA
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Variations</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Cette zone centralise les points d&apos;entrée utiles pour les variantes. Les
          opérations avancées restent dépendantes des migrations 016 à 021 et des écrans
          spécialisés déjà en place.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-gray-900">{card.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{card.description}</p>
            <span className="mt-4 inline-flex text-sm font-medium text-blue-600">
              Ouvrir
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
