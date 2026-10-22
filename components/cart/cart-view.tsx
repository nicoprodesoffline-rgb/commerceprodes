"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { axesLabel, formatAmount } from "@/lib/format";

type PricedLine = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  quantity: number;
  rate_id: string;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  layer: string;
  line_amount: string;
};
type Preview =
  | { ok: true; lines: PricedLine[]; currency: string; total_amount: string; instant_utc: string }
  | { ok: false; error: string; errors: { index: number; code: string; message: string }[]; instant_utc: string };

type Receipt = Record<string, unknown> & { receipt_id?: string; error?: string; total_amount?: string; kind?: string };

const LINE_ERROR_TEXT: Record<string, string> = {
  PRICE_WINDOW_UNAVAILABLE: "Prix indisponible pour cette quantité",
  INVALID_VARIANT: "Variante non proposée",
  INVALID_QUANTITY: "Quantité invalide",
  INVALID_LINE: "Ligne invalide",
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}

export function CartView() {
  const { lines, ready, setQuantity, remove, clear } = useCart();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", organisation: "" });
  const [idemKey, setIdemKey] = useState<string>("");
  const [result, setResult] = useState<{ status: number; body: Receipt } | null>(null);
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
      .then((r) => r.json())
      .then((d: Preview) => setPreview(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [lines, ready]);

  async function submit(kind: "quote" | "order") {
    if (!preview || !preview.ok) return;
    setSending(true);
    try {
      const res = await fetch(`/api/site/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${kind}-${idemKey}`,
          contact: { name: contact.name, email: contact.email, ...(contact.organisation ? { organisation: contact.organisation } : {}) },
          // Les lignes EXACTEMENT affichées (prix inclus) : le serveur les revalide.
          lines: preview.lines.map(({ public_item_key, variant_axes, quantity, rate_id, unit_amount }) => ({
            public_item_key,
            variant_axes,
            quantity,
            rate_id,
            unit_amount,
          })),
        }),
      });
      setResult({ status: res.status, body: await res.json() });
    } catch {
      setResult({ status: 0, body: { error: "NETWORK" } });
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

  const errorsByIndex = new Map<number, string>();
  if (preview && !preview.ok) for (const e of preview.errors) errorsByIndex.set(e.index, e.code);
  const canSubmit = !!preview && preview.ok && !loading && !sending && contact.name.trim() !== "" && contact.email.includes("@");

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-gray-200 bg-white">
        <h2 className="sr-only">Lignes du panier, prix sélectionnés par le serveur</h2>
        <div className="hidden grid-cols-[1fr_6rem_9rem_9rem_5rem] gap-3 bg-gray-50 px-3 py-2 text-xs uppercase tracking-wide text-gray-600 sm:grid" aria-hidden="true">
          <span>Article</span><span>Quantité</span><span className="text-right">Prix unitaire</span><span className="text-right">Ligne</span><span />
        </div>
        <ul>
          {lines.map((l, i) => {
            const priced = preview && preview.ok ? preview.lines[i] : undefined;
            const err = errorsByIndex.get(i);
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
                  {loading ? "…" : priced ? (
                    <>
                      {formatAmount(priced.unit_amount, priced.currency, priced.tax_basis_or_status)}
                      <span className="block break-all font-mono text-[10px] text-gray-400">{priced.rate_id}{priced.layer === "PROMO" ? " · promo" : ""}</span>
                    </>
                  ) : err ? (
                    <span className="text-amber-800">{LINE_ERROR_TEXT[err] ?? err}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                <div className="text-right font-semibold">
                  <span className="block text-xs font-normal text-gray-500 sm:hidden">Ligne</span>
                  {priced && !loading ? formatAmount(priced.line_amount, priced.currency, priced.tax_basis_or_status) : "—"}
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
          <span className="text-sm text-gray-600">Total des lignes (HT, somme serveur)</span>
          <span className="text-base font-bold" data-testid="cart-total">
            {preview && preview.ok && !loading ? formatAmount(preview.total_amount, preview.currency) : "—"}
          </span>
        </div>
        <p className="px-3 py-2 text-xs text-gray-500">
          TVA, frais de port et remises : non qualifiés dans ce spike. Instant de référence :{" "}
          <span className="font-mono">{preview?.instant_utc ?? "—"}</span>
        </p>
      </div>

      <section aria-labelledby="sim-heading" className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
        <h2 id="sim-heading" className="text-lg font-semibold text-amber-900">
          Devis ou commande — SIMULATION
        </h2>
        <p className="mt-1 text-sm text-amber-900">
          Simulateur contractuel : le serveur revalide chaque ligne affichée et renvoie un reçu. <strong>Rien n&apos;est enregistré</strong>{" "}
          (persistence : NONE_CONTRACTUAL_SIMULATION), aucune commande réelle n&apos;est passée.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(["name", "email", "organisation"] as const).map((f) => (
            <label key={f} className="text-sm text-gray-700">
              {f === "name" ? "Nom *" : f === "email" ? "E-mail *" : "Organisme"}
              <input
                type={f === "email" ? "email" : "text"}
                value={contact[f]}
                onChange={(e) => setContact((c) => ({ ...c, [f]: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={!canSubmit} onClick={() => submit("quote")} className="rounded-lg border border-[#cc1818] bg-white px-5 py-2.5 text-sm font-semibold text-[#cc1818] disabled:opacity-40">
            Simuler une demande de devis
          </button>
          <button type="button" disabled={!canSubmit} onClick={() => submit("order")} className="rounded-lg bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            Simuler une commande
          </button>
        </div>
        <div role="status" aria-live="polite" className="mt-4 text-sm">
          {result && result.status === 200 && result.body.receipt_id && (
            <div className="rounded-md border border-green-300 bg-white p-3">
              <p className="font-semibold text-green-800">
                SIMULATION — reçu {String(result.body.receipt_id)} ({result.body.kind === "ORDER" ? "commande" : "devis"}), total{" "}
                {formatAmount(String(result.body.total_amount), "EUR")}. Rien n&apos;a été enregistré.
              </p>
              <button type="button" onClick={clear} className="mt-2 text-xs underline">Vider le panier</button>
            </div>
          )}
          {result && result.status !== 200 && (
            <p className="text-amber-900">SIMULATION — refusé : {String(result.body.error)} (HTTP {result.status}).</p>
          )}
        </div>
      </section>
    </div>
  );
}
