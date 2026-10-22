import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const metadata: Metadata = { title: "Panier" };

export default function CartPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier" }]} />
      <h1 className="text-3xl font-bold text-gray-900">Panier</h1>
      <CartView />
    </div>
  );
}
