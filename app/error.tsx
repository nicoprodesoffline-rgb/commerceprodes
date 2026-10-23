"use client";

import Link from "next/link";

/** Catalogue non servable (ou erreur serveur) : page honnête, aucune donnée de catalogue affichée. */
export default function ErrorPage() {
  return (
    <div className="py-16 text-center" data-testid="catalog-unavailable">
      <h1 className="text-2xl font-bold text-gray-900">Catalogue indisponible</h1>
      <p className="mt-2 text-gray-600">
        Le catalogue ne peut pas être servi pour le moment. Aucun prix ni article n&apos;est affiché plutôt qu&apos;un catalogue incomplet.
      </p>
      <Link href="/" className="mt-4 inline-block text-[#cc1818] underline">Réessayer</Link>
    </div>
  );
}
