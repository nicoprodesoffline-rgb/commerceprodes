"use client";

import { SORTS, type SortKey } from "@/lib/site-catalog/listing";

/** Le tri reste associé aux filtres, même lorsqu'il est affiché à côté du compteur. */
export function ListingSort({ formId, sort }: { formId: string; sort: SortKey }) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-ink-2 sm:w-auto">
      Trier par
      <select
        name="tri"
        form={formId}
        defaultValue={sort}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-[34px] w-full min-w-0 rounded-[9px] border border-line-strong bg-white px-2 text-sm text-ink sm:w-48"
      >
        {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}
