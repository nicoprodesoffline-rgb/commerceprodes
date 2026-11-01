"use client";

/**
 * Bloc d'achat de la fiche Famille : variante → référence `PI-…` → paliers publiés → quantité → « Ajouter au panier »
 * (UNE action principale, UX-P10). Le prix pour la quantité saisie est demandé au SERVEUR (aperçu C0 `selectPrice`,
 * à l'instant serveur) ; le navigateur ne calcule ni ne choisit aucun prix.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_QUANTITY, useCart } from "@/components/cart/cart-provider";
import { minimumQuantity } from "@/components/product/minimum-quantity";
import { shortRef } from "@/lib/site-catalog/short-ref";
import { PriceGrid, type PriceGridRow } from "@/components/product/price-grid";
import { VariantSelector, type SelectorAxis } from "@/components/product/variant-selector";
import { previewCart } from "@/components/site/api";
import { codeMessage, codesMessage, reportCodes } from "@/components/site/codes";
import { axesText, basisLabel, money, price, type AxisDisplay } from "@/components/site/format";
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
  | ({ state: "error"; text: string; codes: string[] } & QuoteFor);

type Feedback = { kind: "ok"; text: string } | { kind: "error"; text: string; codes: string[] } | null;

function parseQty(raw: string): number | null {
  if (!/^\d{1,7}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_QUANTITY ? n : null;
}

export function FamilyBuyBox({
  familyName,
  familySlug,
  description,
  schema,
  items,
  initialKey,
  gallery,
  notice,
  children,
  className = "",
}: {
  familyName: string;
  familySlug: string;
  description?: string;
  schema: SelectorAxis[];
  items: BuyBoxItem[];
  initialKey?: string | undefined;
  gallery?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { add, lines } = useCart();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(initialKey ?? items[0]?.public_item_key ?? "");
  const [qtyRaw, setQtyRaw] = useState(() => String(minimumQuantity(items.find((i) => i.public_item_key === selectedKey)?.rows ?? [])));
  const [quote, setQuote] = useState<Quote>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const qtyId = useRef(`qty-${familySlug}`).current;
  const item = items.find((i) => i.public_item_key === selectedKey);
  const quantity = parseQty(qtyRaw);
  const minimum = minimumQuantity(item?.rows ?? []);
  const belowMinimum = minimum > 1 && /^\d+$/.test(qtyRaw) && Number(qtyRaw) < minimum;

  function selectVariant(key: string) {
    setSelectedKey(key);
    const nextMinimum = minimumQuantity(items.find((i) => i.public_item_key === key)?.rows ?? []);
    if (nextMinimum > 1) setQtyRaw(String(nextMinimum));
    setFeedback(null);
  }

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
        else if (r.network) setQuote({ state: "error", text: codeMessage("NETWORK"), codes: ["NETWORK"], ...asked });
        else {
          const codes = r.json?.error_codes?.length ? r.json.error_codes : [r.json?.site_status ?? "TRANSPORT_ERROR"];
          setQuote({ state: "error", text: codesMessage(codes), codes, ...asked });
        }
      } catch {
        /* annulé */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [item, quantity]);

  // Réponse de la demande courante seulement (variante ET quantité, côté demande et côté ligne renvoyée).
  const current =
    quote.state !== "idle" && quantity !== null && quote.key === item?.public_item_key && quote.quantity === quantity
      ? quote.state !== "line" || (quote.line.public_item_key === item?.public_item_key && quote.line.quantity === quantity)
        ? quote
        : null
      : null;
  const priced = current?.state === "line" && current.line.accepted && current.line.selection ? current.line : null;
  useEffect(() => {
    if (belowMinimum || quantity === null) return;
    if (current?.state === "error") reportCodes("family-price", current.codes);
    else if (current?.state === "line" && !priced?.selection) reportCodes("family-price", current.line.error_codes);
  }, [current, priced, belowMinimum, quantity]);
  useEffect(() => {
    if (feedback?.kind === "error") reportCodes("family-add", feedback.codes);
  }, [feedback]);

  if (!item) return <p>Ce produit est momentanément indisponible.</p>;
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
      if (r.network) setFeedback({ kind: "error", text: `${codeMessage("NETWORK")} Rien n'a été ajouté.`, codes: ["NETWORK"] });
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
        setFeedback({ kind: "error", text: `Rien n'a été ajouté. ${codesMessage(codes)}`, codes });
      }
    } finally {
      setBusy(false);
    }
  }

  const unit = price;

  return (
    <section aria-labelledby="buy-h" className={`grid min-w-0 grid-cols-1 items-start gap-6 lg:gap-10 [overflow-wrap:anywhere] ${className}`}>
      {/* Sur mobile, l'en-tête et les contrôles entourent la galerie ; sur ordinateur, ils forment le panneau de droite. */}
      <div className="contents lg:order-2 lg:block lg:min-w-0 lg:space-y-6 lg:border lg:border-line lg:bg-white lg:p-7">
        <div className="order-1 min-w-0 space-y-4" data-testid="product-heading">
          {notice}
          <h1 id="buy-h" className="scroll-mt-40 text-2xl font-semibold leading-tight text-ink sm:text-3xl">{familyName}</h1>
          <div className="text-sm text-ink-2" data-testid="selected-variant">
            <p>Référence <span className="font-medium text-ink" data-testid="item-ref" data-key={item.public_item_key}>{shortRef(item.public_item_key)}</span></p>
            {item.axes.length > 0 && <p className="mt-1">{axesText(item.axes)}</p>}
          </div>
          {priced?.selection && (
            <p className="tabular text-3xl font-semibold text-[color:var(--color-brand,#a71c19)]" data-testid="product-price">
              {price(priced.selection.unit_amount, priced.selection.tax_basis_or_status)}
              <span className="mt-1 block text-sm font-normal text-ink-2">l’unité</span>
            </p>
          )}
        </div>
        <div className="order-3 min-w-0 space-y-6" data-testid="product-controls">
          <VariantSelector options={schema} items={items} selectedKey={selectedKey} onSelect={selectVariant} />

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={qtyId} className="mb-1 block text-sm font-medium">Quantité</label>
              <div className="flex">
                <button type="button" aria-label="Diminuer la quantité" onClick={() => setQtyRaw(String(Math.max(1, (quantity ?? 2) - 1)))} className="h-[44px] w-[44px] rounded-l-[9px] border border-line-strong bg-white text-lg">−</button>
                <input
                  id={qtyId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={qtyRaw}
                  aria-invalid={quantity === null || belowMinimum}
                  aria-describedby={`${qtyId}-help${minimum > 1 ? ` ${qtyId}-minimum` : ""}`}
                  onChange={(e) => setQtyRaw(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                  className="tabular h-[44px] w-20 border-y border-line-strong bg-white px-2 text-center"
                />
                <button type="button" aria-label="Augmenter la quantité" onClick={() => setQtyRaw(String(Math.min(MAX_QUANTITY, (quantity ?? 0) + 1)))} className="h-[44px] w-[44px] rounded-r-[9px] border border-line-strong bg-white text-lg">+</button>
              </div>
              {minimum > 1 && <p id={`${qtyId}-minimum`} className="mt-1 text-sm text-ink-2">Quantité minimale : {minimum}</p>}
            </div>
            <button
              type="button"
              onClick={() => onAdd()}
              disabled={busy || quantity === null}
              className="product-add-to-cart fixed inset-x-4 bottom-[72px] z-30 min-h-[48px] rounded-[3px] bg-[color:var(--color-brand,#a71c19)] md:bottom-4 lg:static lg:z-auto lg:flex-1 px-5 py-3 font-semibold text-white hover:bg-[color:var(--color-brand-dark,#8f1815)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Vérification…" : "Ajouter au panier"}
            </button>
            <button
              type="button"
              onClick={() => onAdd(true)}
              disabled={busy || quantity === null}
              className="min-h-[48px] w-full rounded-[3px] border border-[color:var(--color-brand,#a71c19)] bg-white px-5 py-3 font-semibold text-[color:var(--color-brand,#a71c19)] hover:bg-[color:var(--color-brand-subtle,#f6e9e8)] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="quote-from-family"
            >
              Demander un devis
            </button>
          </div>
          <p
            id={`${qtyId}-help`}
            className="-mt-2 text-sm"
            aria-live="polite"
            aria-busy={!belowMinimum && quantity !== null && (current === null || current.state === "loading")}
            data-testid="qty-price"
            data-quote-state={quantity === null ? "invalid" : current === null ? "loading" : current.state}
            data-quote-quantity={current && current.state !== "loading" ? current.quantity : undefined}
          >
            {belowMinimum ? (
              <span className="text-signal">Quantité minimale : {minimum}</span>
            ) : quantity === null ? (
              <span className="text-signal">Saisissez une quantité entière entre 1 et 1 000 000.</span>
            ) : current === null || current.state === "loading" ? (
              <span className="text-ink-3">Prix pour {quantity} : vérification…</span>
            ) : current.state === "error" ? (
              <span className="text-signal" data-codes={current.codes.join(" ")}>{current.text}</span>
            ) : priced?.selection ? (
              <span>
                Pour {quantity} : <strong>{unit(priced.selection.unit_amount, priced.selection.tax_basis_or_status)}</strong> l&apos;unité
                {priced.line_total ? <>, soit {money(priced.line_total)} {basisLabel(priced.selection.tax_basis_or_status)} pour la ligne</> : null}.
              </span>
            ) : (
              <span className="text-ink-2" data-codes={current.line.error_codes.join(" ")}>Pour {quantity} : {codesMessage(current.line.error_codes)}</span>
            )}
          </p>

          <div role="status" aria-live="polite" className="text-sm">
            {feedback && (
              <p className={feedback.kind === "ok" ? "text-positive" : "text-signal"} data-codes={feedback.kind === "error" ? feedback.codes.join(" ") : undefined}>
                {feedback.kind === "ok" ? "✓ " : ""}
                {feedback.text}{" "}
                {feedback.kind === "ok" && (
                  <Link href="/panier" className="font-medium text-ink underline">Voir le panier</Link>
                )}
              </p>
            )}
            {!feedback && inCart && <p className="text-ink-2">Déjà dans le panier : {inCart.quantity} (un nouvel ajout s&apos;additionne à cette ligne).</p>}
          </div>
          <PriceGrid rows={item.rows} selectedRateId={priced?.selection?.rate_id ?? null} />
          {description && <p className="whitespace-pre-line leading-relaxed text-ink-2">{description}</p>}
          {children}
        </div>
      </div>
      {gallery && <div className="order-2 min-w-0 lg:order-1 lg:sticky lg:top-56" data-testid="product-gallery">{gallery}</div>}
    </section>
  );
}
