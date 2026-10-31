import Link from "next/link";
import type { ListingQuery } from "@/lib/site-catalog/listing";
import { money } from "@/components/site/format";

/**
 * Filtres et tri d'une liste (recherche ou catégorie) : un formulaire GET, donc tout est dans l'adresse (bouton Précédent, partage, rechargement).
 * Sans script : « Appliquer » envoie le formulaire. Les valeurs refusées sont dites, jamais corrigées en silence.
 */
export function ListingControls({ formId, action, query, hidden }: { formId: string; action: string; query: ListingQuery; hidden?: Record<string, string> }) {
  const active: string[] = [];
  if (query.min !== null) active.push(`Prix ≥ ${money(`${query.min / 100n}.${String(query.min % 100n).padStart(2, "0")}`)}`);
  if (query.max !== null) active.push(`Prix ≤ ${money(`${query.max / 100n}.${String(query.max % 100n).padStart(2, "0")}`)}`);
  const cleared = new URLSearchParams(hidden ?? {}).toString();
  return (
    <div className="space-y-3" data-testid="listing-controls">
      <form id={formId} action={action} method="get" className="space-y-3 rounded-[14px] border border-line bg-white p-4" aria-label="Filtrer et trier">
        {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Filtres</h2>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-ink-2">Prix (€)</legend>
          <div className="flex items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Prix minimum (€)</span>
              <input name="prix_min" inputMode="decimal" placeholder="Min" defaultValue={query.minRaw} maxLength={12} className="h-[34px] w-full min-w-0 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
            </label>
            <span aria-hidden="true" className="text-ink-3">–</span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Prix maximum (€)</span>
              <input name="prix_max" inputMode="decimal" placeholder="Max" defaultValue={query.maxRaw} maxLength={12} className="h-[34px] w-full min-w-0 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
            </label>
          </div>
        </fieldset>
        <button type="submit" className="h-[42px] w-full rounded-[9px] bg-ink px-4 text-sm font-medium text-white">Appliquer</button>
        <Link href={cleared ? `${action}?${cleared}` : action} className="flex min-h-[34px] items-center justify-center text-sm text-ink-2 underline-offset-2 hover:underline">Effacer</Link>
      </form>
      {query.ignored.map((m) => <p key={m} role="note" className="text-sm text-caution">{m}</p>)}
      {active.length > 0 && (
        <ul aria-label="Filtres actifs" className="flex flex-wrap gap-2" data-testid="active-filters">
          {active.map((a) => <li key={a} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs">{a}</li>)}
        </ul>
      )}
    </div>
  );
}
