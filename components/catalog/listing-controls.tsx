import Link from "next/link";
import { SORTS, type ListingQuery } from "@/lib/site-catalog/listing";
import { money } from "@/components/site/format";

/**
 * Filtres et tri d'une liste (recherche ou catégorie) : un formulaire GET, donc tout est dans l'adresse (bouton Précédent, partage, rechargement).
 * Sans script : « Appliquer » envoie le formulaire. Les valeurs refusées sont dites, jamais corrigées en silence.
 */
export function ListingControls({ action, query, hidden }: { action: string; query: ListingQuery; hidden?: Record<string, string> }) {
  const active: string[] = [];
  if (query.min !== null) active.push(`Prix ≥ ${money(`${query.min / 100n}.${String(query.min % 100n).padStart(2, "0")}`)}`);
  if (query.max !== null) active.push(`Prix ≤ ${money(`${query.max / 100n}.${String(query.max % 100n).padStart(2, "0")}`)}`);
  const cleared = new URLSearchParams(hidden ?? {}).toString();
  return (
    <div className="space-y-3" data-testid="listing-controls">
      <form action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line bg-white p-3" aria-label="Filtrer et trier">
        {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col text-xs text-ink-2">
          Prix mini (€)
          <input name="prix_min" inputMode="decimal" defaultValue={query.minRaw} maxLength={12} className="mt-1 h-[34px] w-28 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
        </label>
        <label className="flex flex-col text-xs text-ink-2">
          Prix maxi (€)
          <input name="prix_max" inputMode="decimal" defaultValue={query.maxRaw} maxLength={12} className="mt-1 h-[34px] w-28 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
        </label>
        <label className="flex flex-col text-xs text-ink-2">
          Trier par
          <select name="tri" defaultValue={query.sort} className="mt-1 h-[34px] rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink">
            {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="h-[34px] rounded-[9px] bg-ink px-4 text-sm font-medium text-white">Appliquer</button>
        <Link href={cleared ? `${action}?${cleared}` : action} className="inline-flex h-[34px] items-center rounded-[9px] border border-line-strong bg-white px-3 text-sm hover:bg-surface">Effacer</Link>
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
