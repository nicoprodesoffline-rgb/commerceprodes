"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { axesLabel, formatAmount } from "@/lib/format";
import { CODE_TEXT, type BusinessJson, type PreviewJson } from "@/lib/site-business/client-types";

type Contact = { organisation_name: string; contact_name: string; email: string; phone: string };

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function codesText(codes: string[]): string {
  return codes.map((c) => CODE_TEXT[c] ?? c).join(", ");
}

/**
 * Panier : prix sélectionnés par le serveur (C0 `selectPrice`), une ligne par variante.
 * Devis et commande envoient au serveur les lignes EXACTEMENT affichées et la génération
 * (`catalogue_sequence`) de cet affichage : le serveur revalide (C0) et ne persiste rien.
 */
export function CartView() {
  const { lines, ready, catalogueSequence, setCatalogueSequence, setQuantity, remove, clear } = useCart();
  const [preview, setPreview] = useState<PreviewJson | null>(null);
  const [previewStatus, setPreviewStatus] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<Contact>({ organisation_name: "", contact_name: "", email: "", phone: "" });
  const [message, setMessage] = useState("");
  const [idemKey, setIdemKey] = useState<string>("");
  const [result, setResult] = useState<{ status: number; body: BusinessJson } | null>(null);
  const [sending, setSending] = useState(false);

  // Toute modification du panier → nouvel aperçu serveur + nouvelle clé d'idempotence.
  useEffect(() => {
    if (!ready) return;
    setIdemKey(newKey());
    setResult(null);
    if (lines.length === 0) {
      setPreview(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch("/api/site/cart/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: lines.map(({ public_item_key, variant_axes, quantity }) => ({ public_item_key, variant_axes, quantity })) }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        setPreviewStatus(r.status);
        return (await r.json()) as PreviewJson;
      })
      .then((d) => setPreview(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [lines, ready]);

  const changedSinceAdd =
    preview !== null && catalogueSequence !== null && preview.catalogue_sequence !== catalogueSequence;

  async function submit(kind: "quote" | "order") {
    if (!preview || preview.lines.length === 0) return;
    setSending(true);
    const c = { organisation_name: contact.organisation_name, contact_name: contact.contact_name, email: contact.email, phone: contact.phone.trim() === "" ? null : contact.phone };
    const body =
      kind === "order"
        ? {
            contract_version: "site_business.v1",
            kind: "order",
            idempotency_key: `order-${idemKey}`,
            catalogue_sequence: preview.catalogue_sequence,
            contact: c,
            currency: "EUR",
            total_amount: preview.total_amount,
            // Les lignes EXACTEMENT affichées (prix inclus) : le serveur les revalide.
            lines: preview.lines.map((l) => ({
              public_item_key: l.public_item_key,
              variant_axes: l.variant_axes,
              quantity: l.quantity,
              rate_id: l.selection?.rate_id,
              unit_amount: l.selection?.unit_amount,
              line_total: l.line_total,
            })),
          }
        : {
            contract_version: "site_business.v1",
            kind: "quote_request",
            idempotency_key: `quote-${idemKey}`,
            catalogue_sequence: preview.catalogue_sequence,
            contact: c,
            message: message.trim() === "" ? null : message,
            lines: preview.lines.map((l) => ({
              public_item_key: l.public_item_key,
              variant_axes: l.variant_axes,
              quantity: l.quantity,
              displayed: l.accepted && l.selection ? { rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount } : null,
            })),
          };
    try {
      const res = await fetch(`/api/site/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setResult({ status: res.status, body: (await res.json()) as BusinessJson });
    } catch {
      setResult({ status: 0, body: { verdict: null, site_status: "NETWORK" } });
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <p className="text-gray-500">Chargement du panier…</p>;
  if (lines.length === 0) {
    return (
      <p className="text-gray-600">
        Votre panier est vide. <Link href="/" className="text-[#cc1818] underline">Voir le catalogue</Link>
      </p>
    );
  }

  const contactOk = contact.organisation_name.trim() !== "" && contact.contact_name.trim() !== "" && contact.email.includes("@");
  const previewUsable = !!preview && preview.lines.length === lines.length && !loading && !sending;
  const canQuote = previewUsable && contactOk && preview!.lines.every((l) => l.accepted || (l.error_codes.length === 1 && l.error_codes[0] === "PRICE_WINDOW_UNAVAILABLE"));
  const canOrder = previewUsable && contactOk && preview!.accepted;
  const v = result?.body.verdict ?? null;

  return (
    <div className="space-y-8">
      {changedSinceAdd && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="cart-generation-changed">
          Le catalogue a changé depuis l&apos;ajout (séquence {catalogueSequence} → {preview!.catalogue_sequence}) : les prix ci-dessous sont ceux de la génération courante.{" "}
          <button type="button" className="underline" onClick={() => setCatalogueSequence(preview!.catalogue_sequence)}>J&apos;ai pris connaissance</button>
        </p>
      )}
      {preview && previewStatus !== 200 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Panier refusé par le serveur : {codesText(preview.error_codes)}.</p>
      )}
      <div className="rounded-xl border border-gray-200 bg-white">
        <h2 className="sr-only">Lignes du panier, prix sélectionnés par le serveur</h2>
        <div className="hidden grid-cols-[1fr_6rem_9rem_9rem_5rem] gap-3 bg-gray-50 px-3 py-2 text-xs uppercase tracking-wide text-gray-600 sm:grid" aria-hidden="true">
          <span>Article</span><span>Quantité</span><span className="text-right">Prix unitaire</span><span className="text-right">Ligne</span><span />
        </div>
        <ul>
          {lines.map((l, i) => {
            const pl = preview && preview.lines.length === lines.length ? preview.lines[i] : undefined;
            const sel = pl?.accepted ? pl.selection : null;
            const canonical = pl?.superseded_by[l.public_item_key];
            return (
              <li
                key={`${l.public_item_key}-${i}`}
                className="grid grid-cols-2 gap-3 border-t border-gray-100 px-3 py-3 text-sm sm:grid-cols-[1fr_6rem_9rem_9rem_5rem] sm:items-center"
                data-testid="cart-line"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="font-medium text-gray-900">{l.family_name}</span>
                  <span className="block break-words text-xs text-gray-500">
                    {axesLabel(l.variant_axes)} · <span className="font-mono">{l.public_item_key}</span>
                  </span>
                  {canonical && (
                    <Link href={`/article/${canonical}`} className="block text-xs text-[#cc1818] underline">Remplacé par {canonical}</Link>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 sm:sr-only" htmlFor={`qty-${i}`}>Quantité <span className="sr-only">pour {l.public_item_key}</span></label>
                  <input
                    id={`qty-${i}`}
                    type="number"
                    min={1}
                    step={1}
                    value={l.quantity}
                    onChange={(e) => setQuantity(i, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="block w-20 rounded-md border border-gray-300 px-2 py-1"
                  />
                </div>
                <div className="text-right">
                  <span className="block text-xs text-gray-500 sm:hidden">Prix unitaire</span>
                  {loading ? "…" : sel ? (
                    <>
                      {formatAmount(sel.unit_amount, sel.currency, sel.tax_basis_or_status)}
                      <span className="block break-all font-mono text-[10px] text-gray-400">{sel.rate_id}</span>
                    </>
                  ) : pl ? (
                    <span className="text-amber-800">{codesText(pl.error_codes)}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                <div className="text-right font-semibold">
                  <span className="block text-xs font-normal text-gray-500 sm:hidden">Ligne</span>
                  {sel && pl?.line_total && !loading ? formatAmount(pl.line_total, sel.currency, sel.tax_basis_or_status) : "—"}
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => remove(i)} className="text-xs text-gray-500 underline hover:text-[#cc1818]">
                    Retirer<span className="sr-only"> {l.public_item_key}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-end gap-4 border-t border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-sm text-gray-600">Total des lignes (somme serveur, sans taxe ni port)</span>
          <span className="text-base font-bold" data-testid="cart-total">
            {preview?.total_amount && !loading ? formatAmount(preview.total_amount, preview.currency ?? "EUR", "") : "—"}
          </span>
        </div>
        <p className="px-3 py-2 text-xs text-gray-500">
          TVA, frais de port et remises : non calculés. Génération <span className="font-mono">{preview?.catalogue_sequence ?? "—"}</span>, instant serveur{" "}
          <span className="font-mono">{preview?.instant_utc ?? "—"}</span>
        </p>
      </div>

      <section aria-labelledby="sub-heading" className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
        <h2 id="sub-heading" className="text-lg font-semibold text-amber-900">Devis ou commande — validation sans enregistrement</h2>
        <p className="mt-1 text-sm text-amber-900">
          Le serveur revalide chaque ligne affichée (contrat C0). <strong>Rien n&apos;est enregistré</strong> (persistence : NONE_UNTIL_BC4) :
          aucune demande ni commande réelle n&apos;est transmise.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["organisation_name", "Organisme *", "text"],
              ["contact_name", "Nom *", "text"],
              ["email", "E-mail *", "email"],
              ["phone", "Téléphone", "tel"],
            ] as const
          ).map(([f, label, type]) => (
            <label key={f} className="text-sm text-gray-700">
              {label}
              <input
                type={type}
                value={contact[f]}
                onChange={(e) => setContact((c) => ({ ...c, [f]: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
              />
            </label>
          ))}
          <label className="text-sm text-gray-700 sm:col-span-2">
            Message (devis)
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={!canQuote} onClick={() => submit("quote")} className="rounded-lg border border-[#cc1818] bg-white px-5 py-2.5 text-sm font-semibold text-[#cc1818] disabled:opacity-40">
            Valider une demande de devis
          </button>
          <button type="button" disabled={!canOrder} onClick={() => submit("order")} className="rounded-lg bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            Valider une commande
          </button>
        </div>
        <div role="status" aria-live="polite" className="mt-4 text-sm">
          {v?.accepted && (
            <div className="rounded-md border border-green-300 bg-white p-3">
              <p className="font-semibold text-green-800">
                Validé par le serveur ({result!.body.kind === "order" ? "commande" : "demande de devis"})
                {v.receipt?.total_amount ? `, total ${formatAmount(v.receipt.total_amount, "EUR", "")}` : ""}. NON ENREGISTRÉ (persistence {result!.body.persistence}).
              </p>
              <button type="button" onClick={clear} className="mt-2 text-xs underline">Vider le panier</button>
            </div>
          )}
          {result && !v?.accepted && (
            <p className="text-amber-900">
              Refusé : {v ? codesText(v.error_codes) : (result.body.site_status ?? "erreur")} (HTTP {result.status}).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
