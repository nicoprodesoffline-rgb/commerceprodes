"use client";

import { useEffect, useState } from "react";
import { useWishlist } from "lib/wishlist/context";
import { useCart } from "components/cart/cart-context";
import { ShareCartButton } from "components/cart/share-cart-button";
import Link from "next/link";
import Image from "next/image";
import Footer from "components/layout/footer";
import { toast } from "sonner";

interface WishlistProduct {
  id: string;
  handle: string;
  title: string;
  regular_price: number;
  featured_image_url?: string;
  sku?: string;
}

function formatHT(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € HT";
}

export default function WishlistPage() {
  const { wishlist, toggle } = useWishlist();
  const { addCartItem } = useCart();
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wishlist.length === 0) {
      setProducts([]);
      return;
    }
    setLoading(true);
    fetch(`/api/products-by-handles?handles=${wishlist.join(",")}`)
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wishlist]);

  const handleAddAll = () => {
    products.forEach((p) => {
      const variant = {
        id: p.id,
        title: "Default Title",
        availableForSale: true,
        selectedOptions: [],
        price: { amount: String(p.regular_price), currencyCode: "EUR" },
      };
      const product = {
        id: p.id,
        handle: p.handle,
        title: p.title,
        featuredImage: { url: p.featured_image_url ?? "", altText: p.title, width: 400, height: 400 },
        availableForSale: true,
        description: "",
        descriptionHtml: "",
        options: [],
        priceRange: {
          maxVariantPrice: { amount: String(p.regular_price), currencyCode: "EUR" },
          minVariantPrice: { amount: String(p.regular_price), currencyCode: "EUR" },
        },
        variants: [variant],
        images: [],
        tags: [],
        seo: { title: "", description: "" },
      } as unknown as Parameters<typeof addCartItem>[1];
      addCartItem(variant as Parameters<typeof addCartItem>[0], product, 1);
    });
    toast.success(`${products.length} produit(s) ajouté(s) au panier`);
  };

  const handleShareWishlist = async () => {
    if (products.length === 0) return;
    try {
      const res = await fetch("/api/cart/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: products.map((p) => ({
            id: p.id,
            quantity: 1,
            cost: {
              totalAmount: { amount: String(p.regular_price), currencyCode: "EUR" },
            },
            merchandise: {
              id: p.id,
              title: "Default Title",
              selectedOptions: [],
              product: {
                id: p.id,
                handle: p.handle,
                title: p.title,
                featuredImage: { url: p.featured_image_url ?? "", altText: p.title, width: 400, height: 400 },
              },
            },
          })),
        }),
      });
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      toast.success("✓ Lien copié ! Valable 30 jours.");
    } catch {
      toast.error("Erreur lors du partage");
    }
  };

  return (
    <>
      <div className="mx-auto max-w-screen-xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Ma sélection
            {wishlist.length > 0 && (
              <span className="ml-2 text-base font-normal text-gray-400">
                ({wishlist.length})
              </span>
            )}
          </h1>
          {products.length >= 2 && (
            <div className="flex gap-2">
              <button
                onClick={handleShareWishlist}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 transition-colors"
              >
                🔗 Partager ma sélection
              </button>
              <button
                onClick={handleAddAll}
                className="flex items-center gap-1.5 rounded-md bg-[#cc1818] px-4 py-2 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors"
              >
                Ajouter tout au panier
              </button>
            </div>
          )}
        </div>

        {wishlist.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mb-4 text-5xl">♥</div>
            <p className="mb-2 text-lg font-semibold text-gray-700">
              Votre sélection est vide
            </p>
            <p className="mb-6 text-sm text-gray-500">
              Cliquez sur ♥ sur n&apos;importe quel produit pour l&apos;ajouter.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center rounded-md bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
            >
              Voir le catalogue →
            </Link>
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-gray-400">Chargement…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <div
                key={p.handle}
                className="group relative rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <button
                  onClick={() => toggle(p.handle)}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[#cc1818] shadow-sm hover:bg-red-50 transition-colors"
                  title="Retirer des favoris"
                >
                  ✕
                </button>
                <Link href={`/product/${p.handle}`}>
                  <div className="relative aspect-square bg-gray-50">
                    {p.featured_image_url ? (
                      <Image
                        src={p.featured_image_url}
                        alt={p.title}
                        fill
                        className="object-contain p-3"
                        sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                      />
                    ) : (
                      <div className="h-full w-full bg-gray-100" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-[#cc1818] transition-colors">
                      {p.title}
                    </p>
                    {p.sku && (
                      <p className="mt-0.5 font-mono text-xs text-gray-400">Réf : {p.sku}</p>
                    )}
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatHT(p.regular_price)}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
