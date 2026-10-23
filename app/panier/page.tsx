import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panier" };

export default function CartPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier" }]} />
      <h1 className="text-2xl font-semibold">Panier</h1>
      <CartView />
    </div>
  );
}
