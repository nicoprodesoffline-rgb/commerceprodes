"use client";

import { useId, useState } from "react";

const REF = /^PI-[0-9A-HJKMNP-TV-Z]{9}$/;

/**
 * Commande rapide par référence (T-T10) : on saisit une référence `PI-…` et on arrive sur la fiche de sa famille, variante choisie, où la quantité se fixe et où le prix est
 * vérifié par le serveur avant tout ajout au panier (aucun ajout « à l'aveugle »). Sans script : le formulaire lance la recherche par référence, qui trouve la même famille.
 */
export function QuickOrder() {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action="/recherche"
      method="get"
      onSubmit={(e) => {
        const ref = value.trim().toUpperCase();
        e.preventDefault();
        if (!REF.test(ref)) return setError("Référence invalide : elle commence par PI- suivi de 9 caractères.");
        setError(null);
        window.location.assign(`/article/${ref}`); // route de redirection (hors rendu de page) : navigation complète
      }}
      className="mt-6 rounded-[14px] border border-line bg-white p-3"
      aria-label="Commande rapide par référence"
      data-testid="quick-order"
    >
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-ink-3">Commande rapide</label>
      <div className="mt-1 flex gap-2">
        <input id={id} name="q" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Référence PI-…" maxLength={20} autoComplete="off" aria-describedby={error ? `${id}-err` : undefined} aria-invalid={error ? true : undefined} className="h-[34px] min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white px-2 font-mono text-sm" />
        <button type="submit" className="h-[34px] shrink-0 rounded-[9px] bg-ink px-3 text-sm font-medium text-white">Aller →</button>
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-signal">{error}</p>}
    </form>
  );
}
