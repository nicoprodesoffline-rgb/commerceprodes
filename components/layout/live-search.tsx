"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion } from "@/lib/site-catalog/suggest";

type Answer = { results: Suggestion[]; total: number };

/**
 * Recherche instantanée de l'en-tête (T-T05) : dès 2 caractères et 0,2 s de pause, jusqu'à 8 familles (image, nom, catégorie, prix tel que le serveur le retient).
 * Entrée envoie le formulaire vers la page de résultats (sans script, c'est tout ce qui existe) ; Échap ou un clic à côté ferme ; la croix efface. Flèches : liste d'options
 * (combobox WAI-ARIA, `aria-activedescendant`). Le navigateur n'affiche que ce que le serveur renvoie ; il ne calcule aucun prix.
 */
export function LiveSearch() {
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (value.trim().length < 2) {
      setAnswer(null); setOpen(false); setBusy(false); setFailed(false);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/site/search?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal, credentials: "same-origin" });
        if (!r.ok) throw new Error(String(r.status));
        setAnswer((await r.json()) as Answer);
        setFailed(false); setActive(-1); setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") { setFailed(true); setAnswer(null); setOpen(true); }
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const results = answer?.results ?? [];
  const optionId = (i: number) => `${listId}-o${i}`;
  const moreHref = `/recherche?q=${encodeURIComponent(value.trim())}`;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { if (open) e.preventDefault(); /* le champ de recherche vide son contenu à Échap : ici Échap ferme seulement la liste */ setOpen(false); input.current?.focus(); return; }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? results.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); window.location.assign(`/famille/${results[active]!.slug}`); }
  }

  return (
    <form ref={root} role="search" action="/recherche" method="get" onKeyDown={onKeyDown} className="relative order-4 flex w-full min-w-0 gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-end" data-testid="live-search">
      <label htmlFor="q-header" className="sr-only">Rechercher une famille de produits</label>
      <div className="relative min-w-0 flex-1 sm:max-w-96">
        <input
          ref={input}
          id="q-header"
          name="q"
          type="search"
          maxLength={100}
          autoComplete="off"
          placeholder="Rechercher (nom de famille)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => answer && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          className="h-[42px] w-full rounded-[9px] border border-line-strong bg-white px-3 pr-9"
        />
        {value !== "" && (
          <button type="button" aria-label="Effacer la recherche" onClick={() => { setValue(""); input.current?.focus(); }} className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[9px] text-ink-3 hover:bg-surface">×</button>
        )}
        <div id={listId} hidden={!open} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-[14px] border border-line bg-white p-2 shadow-lg" data-testid="live-search-panel">
          <p role="status" className="px-2 py-1 text-xs text-ink-3">
            {busy ? "Recherche…" : failed ? "Suggestions indisponibles : lancez la recherche avec Entrée." : answer && answer.total === 0 ? `Aucun résultat pour « ${value.trim()} ».` : answer ? `${answer.total} famille${answer.total > 1 ? "s" : ""}` : ""}
          </p>
          <ul role="listbox" aria-label="Suggestions">
            {results.map((s, i) => (
              <li key={s.slug} id={optionId(i)} role="option" aria-selected={i === active}>
                <Link href={`/famille/${s.slug}`} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-[9px] px-2 py-2 hover:bg-surface ${i === active ? "bg-surface" : ""}`}>
                  {s.imageSha ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/media/${s.imageSha}`} alt="" className="h-12 w-12 shrink-0 rounded-[9px] bg-white object-contain" /> : <span className="h-12 w-12 shrink-0 rounded-[9px] bg-surface" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    {s.category && <span className="block truncate text-xs text-ink-3">{s.category}</span>}
                    <span className="block text-xs text-ink-2">{s.priceText}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {answer && answer.total > 0 && <Link href={moreHref} className="mt-1 flex min-h-[34px] items-center justify-center rounded-[9px] border-t border-line px-2 text-sm font-medium hover:bg-surface">Voir tous les résultats →</Link>}
        </div>
      </div>
      <button type="submit" className="h-[42px] shrink-0 rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface">Rechercher</button>
    </form>
  );
}
