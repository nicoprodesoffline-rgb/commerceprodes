"use client";

import { useState } from "react";
import { useCart } from "components/cart/cart-context";
import { toast } from "sonner";

export function QuickOrderBar() {
  const { addCartItem } = useCart();
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/product-by-sku?sku=${encodeURIComponent(sku.trim())}`);
      if (!res.ok) {
        toast.error(`SKU "${sku}" introuvable — essayez la recherche`);
        return;
      }
      const { product } = await res.json();
      const variant = {
        id: product.id,
        title: "Default Title",
        availableForSale: true,
        selectedOptions: [],
        price: { amount: String(product.regular_price), currencyCode: "EUR" },
      };
      const productData = {
        id: product.id,
        handle: product.handle,
        title: product.title,
        featuredImage: { url: product.featured_image_url ?? "", altText: product.title, width: 400, height: 400 },
        availableForSale: true,
        description: "",
        descriptionHtml: "",
        options: [],
        priceRange: {
          maxVariantPrice: { amount: String(product.regular_price), currencyCode: "EUR" },
          minVariantPrice: { amount: String(product.regular_price), currencyCode: "EUR" },
        },
        variants: [variant],
        images: [],
        tags: [],
        seo: { title: "", description: "" },
      } as unknown as Parameters<typeof addCartItem>[1];
      addCartItem(variant as Parameters<typeof addCartItem>[0], productData, qty);
      toast.success(`✓ ${product.title} ajouté au panier`);
      setSku("");
      setQty(1);
    } catch {
      toast.error("Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-auto border-t border-gray-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Commande rapide
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Entrez un SKU…"
          className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
        />
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
          <button
            type="submit"
            disabled={loading || !sku.trim()}
            className="flex-1 rounded bg-[#cc1818] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-50"
          >
            {loading ? "…" : "Ajouter →"}
          </button>
        </div>
      </form>
    </div>
  );
}
