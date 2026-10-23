"use client";

/**
 * Consultation d'un reçu (C0 §10.5, route BC4 `GET /api/site/receipt`). La référence et le code d'accès sont lus
 * dans le FRAGMENT (`#ref=…&code=…`, jamais envoyé au serveur avec l'adresse de la page) ou saisis. Référence
 * inconnue et code faux sont indiscernables (même message, C0) ; aucune donnée de contact n'est affichée.
 */
import { useEffect, useState } from "react";
import { codeMessage } from "@/components/site/codes";
import { axisValue, money, parisDate, price } from "@/components/site/format";

type Line = { public_item_key: string; variant_axes: Record<string, string>; quantity: number; priced?: boolean; rate_id?: string | null; unit_amount?: string | null; tax_basis_or_status?: string | null; line_total?: string };
type Found = { kind: string; status: string; receipt_ref: string; receipt: { lines?: Line[]; total_amount?: string; created_at_utc?: string; catalogue_sequence?: number } };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "found"; data: Found } | { kind: "refused"; code: string };

export function ReceiptLookup() {
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function lookup(r: string, c: string) {
    setState({ kind: "loading" });
    try {
      const qs = new URLSearchParams({ ref: r.trim(), access_token: c.trim() });
      const res = await fetch(`/api/site/receipt?${qs}`, { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => null)) as (Found & { error_codes?: string[]; outcome?: string }) | null;
      if (res.status === 200 && j?.receipt_ref) setState({ kind: "found", data: j });
      else setState({ kind: "refused", code: j?.error_codes?.[0] ?? (j?.outcome === "TRANSPORT_ERROR" ? "TRANSPORT_ERROR" : "NOT_FOUND") });
    } catch {
      setState({ kind: "refused", code: "NETWORK" });
    }
  }

  // Lien de consultation : lu au chargement ET à chaque changement de fragment (même page, autre lien collé).
  useEffect(() => {
    const fromHash = () => {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const r = h.get("ref") ?? "";
      const c = h.get("code") ?? "";
      if (r) setRef(r);
      if (c) setCode(c);
      if (r && c) void lookup(r, c);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const d = state.kind === "found" ? state.data : null;
  const lines = d?.receipt.lines ?? [];
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(ref, code);
        }}
        className="grid max-w-2xl gap-4 rounded-[14px] border border-line bg-white p-4 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="r-ref" className="block text-sm font-medium">Référence</label>
          <input id="r-ref" value={ref} maxLength={64} autoComplete="off" onChange={(e) => setRef(e.target.value)} className="mt-1 block h-[42px] w-full rounded-[9px] border border-line-strong px-3 font-mono text-sm" />
        </div>
        <div>
          <label htmlFor="r-code" className="block text-sm font-medium">Code d&apos;accès</label>
          <input id="r-code" type="password" value={code} maxLength={128} autoComplete="off" onChange={(e) => setCode(e.target.value)} className="mt-1 block h-[42px] w-full rounded-[9px] border border-line-strong px-3 font-mono text-sm" />
        </div>
        <button type="submit" className="h-[42px] rounded-[9px] bg-ink px-5 font-semibold text-white sm:col-span-2 sm:justify-self-start">Consulter</button>
      </form>
      <div aria-live="polite">
        {state.kind === "loading" && <p className="text-ink-3">Recherche du reçu…</p>}
        {state.kind === "refused" && (
          <p role="alert" className="rounded-[9px] border-2 border-signal bg-white p-3" data-testid="receipt-refused">{codeMessage(state.code)}</p>
        )}
        {d && (
          <section aria-labelledby="rc-h" className="rounded-[14px] border border-line bg-white p-4" data-testid="receipt-found">
            <h2 id="rc-h" className="text-lg font-semibold">
              {d.kind === "order" ? "Commande" : "Demande de devis"} <span className="font-mono">{d.receipt_ref}</span>
            </h2>
            <p className="text-sm text-ink-2">
              État : {d.status === "RECEIVED" ? (d.kind === "order" ? "reçue — en attente de traitement" : "reçue") : d.status}
              {d.receipt.created_at_utc ? ` · reçue le ${parisDate(d.receipt.created_at_utc)}` : ""}
            </p>
            <div className="relative overflow-x-auto">
            <table className="tabular mt-3 w-full text-sm">
              <caption className="sr-only">Lignes enregistrées</caption>
              <thead>
                <tr className="border-b border-line-strong text-left text-xs text-ink-3">
                  <th scope="col" className="py-2 pr-2 font-medium">Référence</th>
                  <th scope="col" className="py-2 pr-2 font-medium">Variante</th>
                  <th scope="col" className="py-2 pr-2 text-right font-medium">Quantité</th>
                  <th scope="col" className="py-2 pr-2 text-right font-medium">Prix unitaire</th>
                  {d.kind === "order" && <th scope="col" className="py-2 text-right font-medium">Total ligne</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={`${l.public_item_key}${JSON.stringify(l.variant_axes)}`} className="h-[34px] border-b border-line">
                    <td className="py-1 pr-2 font-mono text-xs">{l.public_item_key}</td>
                    <td className="py-1 pr-2">{Object.values(l.variant_axes).map(axisValue).join(" · ") || "Modèle unique"}</td>
                    <td className="py-1 pr-2 text-right">{l.quantity}</td>
                    <td className="py-1 pr-2 text-right">{l.unit_amount ? price(l.unit_amount, l.tax_basis_or_status) : "sans prix (à chiffrer)"}</td>
                    {d.kind === "order" && <td className="py-1 text-right">{l.line_total ? money(l.line_total) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {d.receipt.total_amount && <p className="mt-2 text-right font-semibold">Total : {money(d.receipt.total_amount)} <span className="font-normal text-ink-2">(taxes et port non calculés)</span></p>}
          </section>
        )}
      </div>
    </div>
  );
}
