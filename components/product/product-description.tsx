"use client";

import { PriceGrid } from "components/product/price-grid";
import Price from "components/price";
import { VariantSelector } from "./variant-selector";
import { useCart } from "components/cart/cart-context";
import { selectWindow } from "lib/site-dto/pricing";
import type { FamilyView } from "lib/site-dto/types";
import { resolveVariant, selectionFromParams } from "lib/site-dto/variants";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ProductDescription({ family, nowUtc }: { family: FamilyView; nowUtc: string }) {
  const { addLine } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);

  const selection = selectionFromParams(family, (k) => searchParams.get(k));
  const resolved = resolveVariant(family, selection);
  const item = resolved.ok ? resolved.item : null;
  const price = item ? selectWindow(item.windows, quantity, nowUtc) : null;

  const onSelect = (axis: string, value: string) => {
    const next = { ...selection, [axis]: value };
    const r = resolveVariant(family, next);
    const params = new URLSearchParams(next);
    if (r.ok && r.item.media_urls.length > 0) params.set("image", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleAddToCart = () => {
    if (!item || !price?.ok) return;
    addLine({
      public_item_key: item.public_item_key,
      public_family_key: family.public_family_key,
      family_slug: family.slug,
      family_name: family.name,
      variant_axes: item.variant_axes,
      image_url: item.media_urls[0] ?? family.image_main_url,
      quantity,
      windows: item.windows,
    });
  };

  return (
    <>
      {/* Famille + Article */}
      <div className="mb-4 border-b border-gray-200 pb-4">
        <p className="mb-1 text-xs text-gray-400 font-mono">Famille : {family.public_family_key}</p>
        <h1 className="text-2xl font-semibold leading-tight text-gray-900">{family.name}</h1>
        <p className="mt-1 text-xs text-gray-500 font-mono" data-testid="item-key">
          {item ? `Article : ${item.public_item_key}` : "Article : aucune variante achetable sélectionnée"}
        </p>
      </div>

      {/* Description courte (texte brut, pas de HTML injecté) */}
      <p className="mb-5 text-sm text-gray-600 leading-relaxed">{family.description_short}</p>

      <VariantSelector family={family} selection={selection} onSelect={onSelect} />

      {!item && (
        <p role="alert" className="mb-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {resolved.ok === false && resolved.reason === "FORBIDDEN"
            ? "Cette combinaison est interdite : elle n'est pas vendable."
            : "Cette combinaison n'est pas proposée."}
        </p>
      )}

      {/* Quantité */}
      <div className="mb-5">
        <label htmlFor="qty" className="mb-1 block text-sm font-medium text-gray-700">
          Quantité
        </label>
        <input
          id="qty"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
        />
      </div>

      {/* Prix sélectionné (provenance explicite) */}
      <div className="mb-4" aria-live="polite">
        {price?.ok ? (
          <>
            <Price
              className="text-2xl font-bold text-gray-900"
              amount={price.price.unit_amount}
              currencyCode={price.price.currency}
              taxBasis={price.price.tax_basis_or_status}
            />
            <p className="mt-1 text-xs text-gray-500">
              Prix unitaire pour {quantity} · tarif{" "}
              <span className="font-mono">{price.price.rate_id}</span> ({price.price.layer}) ·{" "}
              {price.price.offer_price_version_public}
            </p>
          </>
        ) : item ? (
          <p className="text-lg font-semibold text-amber-700">
            Prix indisponible pour cette quantité à cet instant
          </p>
        ) : null}
      </div>

      {item && (
        <PriceGrid windows={item.windows} nowUtc={nowUtc} selected={price?.ok ? price.price : null} />
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!item || !price?.ok}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          Ajouter au panier
        </button>
        <p className="text-center text-xs text-gray-500">
          Devis et commande depuis le panier — simulation, aucune persistance.
        </p>
      </div>
    </>
  );
}

// Description longue en pleine largeur (texte brut de la fixture).
export function ProductDescriptionTabs({ family }: { family: FamilyView }) {
  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 border-b border-gray-200 pb-2 text-sm font-medium text-[#cc1818]">
        Description complète
      </h2>
      <p className="text-sm leading-relaxed text-gray-700">{family.description_long}</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-gray-700">Variantes publiées</h3>
      <ul className="text-sm text-gray-700">
        {family.items.map((i) => (
          <li key={i.public_item_key} className="font-mono text-xs">
            {i.public_item_key}
            {Object.keys(i.variant_axes).length
              ? ` — ${Object.entries(i.variant_axes).map(([k, v]) => `${k}=${v}`).join(", ")}`
              : " — variante unique"}
          </li>
        ))}
      </ul>
    </div>
  );
}
