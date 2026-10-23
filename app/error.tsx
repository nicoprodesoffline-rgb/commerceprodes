"use client";

/**
 * Erreur pendant le rendu (ex. génération devenue indisponible entre le contrôle du proxy et le rendu) : page
 * honnête, aucune donnée de catalogue. Le cas nominal « catalogue absent » est servi en 503 par `proxy.ts`.
 */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="py-12" data-testid="catalog-unavailable">
      <h1 className="text-2xl font-semibold">Catalogue indisponible</h1>
      <p className="mt-2 text-ink-2">Le catalogue ne peut pas être servi pour le moment. Aucun prix ni article n&apos;est affiché plutôt qu&apos;un catalogue incomplet. Votre panier est conservé.</p>
      <button type="button" onClick={reset} className="mt-4 h-[42px] rounded-[9px] bg-ink px-4 font-medium text-white">Réessayer</button>
    </div>
  );
}
