import Link from "next/link";
import type { ListingQuery } from "@/lib/site-catalog/listing";
import { money } from "@/components/site/format";
import { pastilleStyle } from "@/lib/site-catalog/color-swatch";
import type { AnyFilterGroup, FilterChoice } from "@/lib/site-catalog/filters";

/**
 * Filtres et tri d'une liste (recherche ou catégorie) : un formulaire GET, donc tout est dans l'adresse (bouton Précédent, partage, rechargement).
 * Sans script : « Appliquer » envoie le formulaire. Les valeurs refusées sont dites, jamais corrigées en silence.
 */
export function ListingControls({ formId, action, query, hidden, filters, choice }: { formId: string; action: string; query: ListingQuery; hidden?: Record<string, string>; filters?: AnyFilterGroup[]; choice?: FilterChoice }) {
  const active: string[] = [];
  if (query.min !== null) active.push(`Prix ≥ ${money(`${query.min / 100n}.${String(query.min % 100n).padStart(2, "0")}`)}`);
  if (query.max !== null) active.push(`Prix ≤ ${money(`${query.max / 100n}.${String(query.max % 100n).padStart(2, "0")}`)}`);
  for (const g of filters ?? []) for (const v of choice?.[g.param] ?? []) if (g.options.some((o) => o.value === v)) active.push(`${g.label} : ${g.options.find((o) => o.value === v)?.text ?? v}`);
  const cleared = new URLSearchParams(hidden ?? {}).toString();
  return (
    <div className="space-y-3" data-testid="listing-controls">
      <form id={formId} action={action} method="get" className="space-y-3 rounded-[14px] border border-line bg-white p-3 lg:p-4" aria-label="Filtrer et trier">
        {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Filtres</h2>
        {(filters ?? []).map((g) => (
          <fieldset key={g.param} className="min-w-0" data-filter={g.param}>
            <legend className="mb-2 text-sm font-medium text-ink-2">{g.label}</legend>
            <ul className="space-y-1">
              {g.options.map((o) => {
                const tint = g.param === "coloris" ? pastilleStyle(o.value) : null;
                return (
                  <li key={o.value}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
                      <input type="checkbox" name={g.param} value={o.value} defaultChecked={(choice?.[g.param] ?? []).includes(o.value)} className="h-5 w-5 shrink-0" />
                      {tint && <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-line-strong" style={tint} />}
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.text ?? o.value}</span>
                      <span className="text-ink-3">({o.families})</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-ink-2">Prix (€)</legend>
          <div className="flex items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Prix minimum (€)</span>
              <input name="prix_min" inputMode="decimal" placeholder="Min" defaultValue={query.minRaw} maxLength={12} className="h-[44px] w-full min-w-0 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
            </label>
            <span aria-hidden="true" className="text-ink-3">–</span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Prix maximum (€)</span>
              <input name="prix_max" inputMode="decimal" placeholder="Max" defaultValue={query.maxRaw} maxLength={12} className="h-[44px] w-full min-w-0 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink" />
            </label>
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <button type="submit" className="h-[44px] flex-1 rounded-[9px] bg-brand hover:bg-brand-dark px-4 text-sm font-medium text-white">Appliquer</button>
          <Link href={cleared ? `${action}?${cleared}` : action} className="flex min-h-[44px] items-center justify-center px-2 text-sm text-ink-2 underline-offset-2 hover:underline">Effacer</Link>
        </div>
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
