"use client";

import { useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { PriceGrid, type PriceGridRow } from "@/components/product/price-grid";
import { VariantSelector, type SelectorAxis } from "@/components/product/variant-selector";
import { axesLabel, formatAmount } from "@/lib/format";

export type BuyBoxItem = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  image_sha256: string | null;
  rows: PriceGridRow[];
};

type Feedback =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | null;

const ERROR_TEXT: Record<string, string> = {
  PRICE_WINDOW_UNAVAILABLE: "Prix indisponible pour cette quantité à cet instant.",
  INVALID_VARIANT: "Cette variante n'est pas proposée.",
  INVALID_QUANTITY: "Quantité invalide (entier ≥ 1).",
};

export function FamilyBuyBox({
  familyName,
  schema,
  items,
  unavailableNotes,
}: {
  familyName: string;
  schema: SelectorAxis[];
  items: BuyBoxItem[];
  unavailableNotes: string[];
}) {
  const { add } = useCart();
  const [selectedKey, setSelectedKey] = useState(items[0]?.public_item_key ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const item = items.find((i) => i.public_item_key === selectedKey);
  if (!item) return <p>Aucun article publié.</p>;

  async function onAdd() {
    if (!item) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/site/cart/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: [{ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity }],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const l = data.lines[0];
        add({ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity, family_name: familyName });
        setFeedback({
          kind: "ok",
          text: `Ajouté au panier — prix retenu par le serveur : ${formatAmount(l.unit_amount, l.currency, l.tax_basis_or_status)} (${l.rate_id}).`,
        });
      } else {
        setFeedback({ kind: "error", text: ERROR_TEXT[data.error] ?? `Refusé : ${data.error}` });
      }
    } catch {
      setFeedback({ kind: "error", text: "Serveur injoignable : rien n'a été ajouté." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="item-heading" className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="item-heading" className="text-lg font-semibold text-gray-900">
        Article <span className="font-mono text-sm text-gray-500">{item.public_item_key}</span>
      </h2>
      <p className="mb-4 text-sm text-gray-600">{axesLabel(item.variant_axes)}</p>

      <VariantSelector
        options={schema}
        items={items}
        selectedKey={selectedKey}
        onSelect={(k) => {
          setSelectedKey(k);
          setFeedback(null);
        }}
        unavailableNotes={unavailableNotes}
      />

      {item.image_sha256 ? (
        <figure className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/media/${item.image_sha256}`}
            alt={`Image de la variante ${axesLabel(item.variant_axes)}`}
            className="h-32 w-32 rounded border border-gray-200 object-contain [image-rendering:pixelated]"
          />
          <figcaption className="mt-1 text-xs text-gray-500">Image propre à cette variante</figcaption>
        </figure>
      ) : (
        <p className="mb-4 text-xs text-gray-500">Pas d&apos;image propre à cette variante : image de la famille ci-contre.</p>
      )}

      <PriceGrid rows={item.rows} />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          Quantité
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="mt-1 block w-24 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          onClick={onAdd}
          disabled={busy || quantity < 1}
          className="rounded-lg bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-50"
        >
          {busy ? "Vérification…" : "Ajouter au panier"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm">
        {feedback && (
          <span className={feedback.kind === "ok" ? "text-green-700" : "text-amber-800"}>{feedback.text}</span>
        )}
      </p>
    </section>
  );
}
