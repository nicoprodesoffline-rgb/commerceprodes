"use client";

/**
 * Bloc d'achat de la fiche Famille : variante → référence `PI-…` → paliers publiés → quantité → « Ajouter au panier »
 * (UNE action principale, UX-P10). Le prix pour la quantité saisie est demandé au SERVEUR (aperçu C0 `selectPrice`,
 * à l'instant serveur) ; le navigateur ne calcule ni ne choisit aucun prix.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_QUANTITY, useCart } from "@/components/cart/cart-provider";
import { PriceGrid, type PriceGridRow } from "@/components/product/price-grid";
import { VariantSelector, type SelectorAxis } from "@/components/product/variant-selector";
import { previewCart } from "@/components/site/api";
import { codeMessage, codesMessage } from "@/components/site/codes";
import { BasisNotice } from "@/components/site/basis-notice";
import { axesText, axisValue, basisLabel, money, price, uniformBasis, type AxisDisplay } from "@/components/site/format";
import { MediaImage } from "@/components/site/media-image";
import type { PreviewLineJson } from "@/lib/site-business/client-types";

export type BuyBoxItem = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  axes: AxisDisplay[];
  image_sha256: string | null;
  rows: PriceGridRow[];
};

// Chaque réponse porte la demande (variante, quantité) à laquelle elle répond : un prix n'est affiché que pour la
// demande COURANTE (revue I1 D-03 : entre une saisie et la réponse, la nouvelle quantité s'affichait avec le prix et le
// total de l'ancienne, dans une région `aria-live`). Toute autre réponse est obsolète et ignorée.
type QuoteFor = { key: string; quantity: number };
type Quote =
  | { state: "idle" }
  | ({ state: "loading" } & QuoteFor)
  | ({ state: "line"; line: PreviewLineJson; sequence: number } & QuoteFor)
  | ({ state: "error"; text: string } & QuoteFor);

type Feedback = { kind: "ok" | "error"; text: string } | null;

function parseQty(raw: string): number | null {
  if (!/^\d{1,7}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_QUANTITY ? n : null;
}

export function FamilyBuyBox({
  familyName,
  familySlug,
  schema,
  items,
  initialKey,
}: {
  familyName: string;
  familySlug: string;
  schema: SelectorAxis[];
  items: BuyBoxItem[];
  initialKey?: string | undefined;
}) {
  const { add, lines } = useCart();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(initialKey ?? items[0]?.public_item_key ?? "");
  const [qtyRaw, setQtyRaw] = useState("1");
  const [quote, setQuote] = useState<Quote>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const qtyId = useRef(`qty-${familySlug}`).current;
  const item = items.find((i) => i.public_item_key === selectedKey);
  const quantity = parseQty(qtyRaw);

  // Adresse partageable de la variante choisie (sans rechargement).
  useEffect(() => {
    if (!item) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("article") !== item.public_item_key) {
      url.searchParams.set("article", item.public_item_key);
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, [item]);

  // Prix pour la quantité saisie : aperçu serveur, différé de 300 ms, annulé si la saisie change.
  useEffect(() => {
    if (!item || quantity === null) {
      setQuote({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const asked: QuoteFor = { key: item.public_item_key, quantity };
    // Dès la saisie (avant le délai de 300 ms) : « vérification… », jamais le prix d'une demande précédente.
    setQuote({ state: "loading", ...asked });
    const timer = setTimeout(async () => {
      try {
        const r = await previewCart([{ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity }], ctrl.signal);
        if (ctrl.signal.aborted) return; // demande remplacée entre-temps : réponse obsolète
        const line = r.json?.lines?.[0];
        if (r.status === 200 && line && r.json) setQuote({ state: "line", line, sequence: r.json.catalogue_sequence, ...asked });
        else if (r.network) setQuote({ state: "error", text: codeMessage("NETWORK"), ...asked });
        else setQuote({ state: "error", text: codesMessage(r.json?.error_codes?.length ? r.json.error_codes : [r.json?.site_status ?? "TRANSPORT_ERROR"]), ...asked });
      } catch {
        /* annulé */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [item, quantity]);

  if (!item) return <p>Aucune variante publiée.</p>;
  const inCart = lines.find((l) => l.public_item_key === item.public_item_key);

  /** Ajoute la variante au panier (prix vérifié par le serveur) ; `toQuote` ouvre ensuite la demande de devis : même parcours que depuis le panier, aucun second formulaire. */
  async function onAdd(toQuote = false) {
    if (!item || quantity === null) return;
    // Le bouton qui a lancé l'ajout : le tiroir lui rend le focus à sa fermeture (il est désactivé pendant la vérification, donc le lire plus tard ne donnerait rien).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true);
    setFeedback(null);
    try {
      const r = await previewCart([{ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity }]);
      const l = r.json?.lines?.[0];
      const draft = { public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity, family_name: familyName, family_slug: familySlug, axes: item.axes };
      if (r.network) setFeedback({ kind: "error", text: `${codeMessage("NETWORK")} Rien n'a été ajouté.` });
      else if (r.status === 200 && l?.accepted && l.selection && r.json) {
        add(draft, r.json.catalogue_sequence, { announce: !toQuote, opener });
        if (toQuote) { router.push("/devis"); return; }
        setFeedback({ kind: "ok", text: `Ajouté au panier — ${quantity} × ${axesText(item.axes)}, ${unit(l.selection.unit_amount, l.selection.tax_basis_or_status)} l'unité.` });
      } else if (r.status === 200 && l && r.json && l.error_codes.length === 1 && l.error_codes[0] === "PRICE_WINDOW_UNAVAILABLE") {
        add(draft, r.json.catalogue_sequence, { announce: !toQuote, opener });
        if (toQuote) { router.push("/devis"); return; }
        setFeedback({ kind: "ok", text: `Ajouté au panier sans prix — ${quantity} × ${axesText(item.axes)}. Seule une demande de devis sera possible pour cette ligne.` });
      } else {
        const codes = l?.error_codes?.length ? l.error_codes : r.json?.error_codes?.length ? r.json.error_codes : [r.json?.site_status ?? "TRANSPORT_ERROR"];
        setFeedback({ kind: "error", text: `Rien n'a été ajouté. ${codesMessage(codes)}` });
      }
    } finally {
      setBusy(false);
    }
  }

  // Réponse de la demande courante seulement (variante ET quantité, côté demande et côté ligne renvoyée).
  const current =
    quote.state !== "idle" && quantity !== null && quote.key === item.public_item_key && quote.quantity === quantity
      ? quote.state !== "line" || (quote.line.public_item_key === item.public_item_key && quote.line.quantity === quantity)
        ? quote
        : null
      : null;
  const priced = current?.state === "line" && current.line.accepted && current.line.selection ? current.line : null;
  const anyPrice = item.rows.some((r) => r.selected);
  // Base fiscale de TOUTE la fiche : commune → dite une fois par le bandeau et sur le total de la ligne ; sinon chaque montant porte la sienne (friction 14).
  const fiche = uniformBasis(items.flatMap((i) => i.rows.filter((r) => r.selected).map((r) => r.tax_basis_or_status)));
  const unit = (amount: string, basis: string | null | undefined) => (fiche.uniform && basis === fiche.basis ? money(amount) : price(amount, basis));

  return (
    <section aria-labelledby="buy-h" className="space-y-5 rounded-[14px] border border-line bg-white p-4 sm:p-5">
      <h2 id="buy-h" className="sr-only">Choisir une variante et une quantité</h2>
      <VariantSelector
        options={schema}
        items={items}
        selectedKey={selectedKey}
        onSelect={(k) => {
          setSelectedKey(k);
          setFeedback(null);
        }}
      />

      <div className="flex items-start gap-3 border-t border-line pt-4" data-testid="selected-variant">
        {item.image_sha256 && <MediaImage sha256={item.image_sha256} alt={`Image de la variante ${axesText(item.axes)}`} className="h-16 w-16 shrink-0 rounded-[9px] border border-line [image-rendering:pixelated]" />}
        <div className="min-w-0 text-sm">
          <p className="font-medium">Variante choisie</p>
          <p>{axesText(item.axes)}</p>
          <p className="text-ink-2">
            Référence <span className="font-mono text-ink" data-testid="item-ref">{item.public_item_key}</span>
          </p>
        </div>
      </div>

      {fiche.uniform && <BasisNotice basis={fiche.basis} />}
      <PriceGrid rows={item.rows} selectedRateId={priced?.selection?.rate_id ?? null} caption="Prix de vente PRODES par quantité, en vigueur maintenant" showBasis={!fiche.uniform} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={qtyId} className="mb-1 block text-sm font-medium">Quantité</label>
          <div className="flex">
            <button type="button" aria-label="Diminuer la quantité" onClick={() => setQtyRaw(String(Math.max(1, (quantity ?? 2) - 1)))} className="h-[42px] w-[42px] rounded-l-[9px] border border-line-strong bg-white text-lg">−</button>
            <input
              id={qtyId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={qtyRaw}
              aria-invalid={quantity === null}
              aria-describedby={`${qtyId}-help`}
              onChange={(e) => setQtyRaw(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
              className="tabular h-[42px] w-20 border-y border-line-strong bg-white px-2 text-center"
            />
            <button type="button" aria-label="Augmenter la quantité" onClick={() => setQtyRaw(String(Math.min(MAX_QUANTITY, (quantity ?? 0) + 1)))} className="h-[42px] w-[42px] rounded-r-[9px] border border-line-strong bg-white text-lg">+</button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAdd()}
          disabled={busy || quantity === null}
          className="h-[42px] rounded-[9px] bg-ink px-5 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Vérification…" : anyPrice ? "Ajouter au panier" : "Ajouter au panier (devis sans prix)"}
        </button>
        <button
          type="button"
          onClick={() => onAdd(true)}
          disabled={busy || quantity === null}
          className="h-[42px] rounded-[9px] border border-ink bg-white px-5 font-semibold text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="quote-from-family"
        >
          Demander un devis
        </button>
      </div>
      <p
        id={`${qtyId}-help`}
        className="-mt-2 text-sm"
        aria-live="polite"
        aria-busy={quantity !== null && (current === null || current.state === "loading")}
        data-testid="qty-price"
        data-quote-state={quantity === null ? "invalid" : current === null ? "loading" : current.state}
        data-quote-quantity={current && current.state !== "loading" ? current.quantity : undefined}
      >
        {quantity === null ? (
          <span className="text-signal">Saisissez une quantité entière entre 1 et 1 000 000.</span>
        ) : current === null || current.state === "loading" ? (
          <span className="text-ink-3">Prix pour {quantity} : vérification auprès du serveur…</span>
        ) : current.state === "error" ? (
          <span className="text-signal">{current.text}</span>
        ) : priced?.selection ? (
          <span>
            Pour {quantity} : <strong>{unit(priced.selection.unit_amount, priced.selection.tax_basis_or_status)}</strong> l&apos;unité
            {priced.line_total ? <>, soit {money(priced.line_total)} {basisLabel(priced.selection.tax_basis_or_status)} pour la ligne</> : null}.
          </span>
        ) : (
          <span className="text-ink-2">Pour {quantity} : {codesMessage(current.line.error_codes)}</span>
        )}
      </p>

      <div role="status" aria-live="polite" className="text-sm">
        {feedback && (
          <p className={feedback.kind === "ok" ? "text-positive" : "text-signal"}>
            {feedback.kind === "ok" ? "✓ " : ""}
            {feedback.text}{" "}
            {feedback.kind === "ok" && (
              <Link href="/panier" className="font-medium text-ink underline">Voir le panier</Link>
            )}
          </p>
        )}
        {!feedback && inCart && <p className="text-ink-2">Déjà dans le panier : {inCart.quantity} (un nouvel ajout s&apos;additionne à cette ligne).</p>}
      </div>

      {items.length > 1 && (
        <details open={items.length <= 8} className="border-t border-line pt-4">
          <summary className="inline-flex min-h-[34px] cursor-pointer items-center text-sm font-semibold">Variantes proposées ({items.length})</summary>
          <div className="relative overflow-x-auto">
          <table className="tabular mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-3">
                <th scope="col" className="py-2 pr-2 font-medium">Variante</th>
                <th scope="col" className="py-2 pr-2 font-medium">Référence</th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">Prix pour 1</th>
                <th scope="col" className="py-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const first = i.rows.find((r) => r.selected && r.tier_quantity === 1);
                const isSel = i.public_item_key === selectedKey;
                return (
                  <tr key={i.public_item_key} className={`h-[42px] border-b border-line ${isSel ? "bg-signal-subtle" : ""}`}>
                    <td className="py-1 pr-2">{i.axes.map((a) => axisValue(a.value)).join(" · ")}</td>
                    <td className="py-1 pr-2 font-mono text-xs whitespace-nowrap">{i.public_item_key}</td>
                    <td className="py-1 pr-2 text-right whitespace-nowrap">{first?.unit_amount ? unit(first.unit_amount, first.tax_basis_or_status) : "indisponible"}</td>
                    <td className="py-1 text-right">
                      {isSel ? (
                        <span className="text-xs font-medium text-signal">Choisie</span>
                      ) : (
                        <button type="button" onClick={() => { setSelectedKey(i.public_item_key); setFeedback(null); }} className="min-h-[34px] rounded-[9px] border border-line-strong px-3 text-xs hover:bg-surface">
                          Choisir<span className="sr-only"> {i.axes.map((a) => axisValue(a.value)).join(" ")}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </details>
      )}
    </section>
  );
}
