import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Commande" };

export default function OrderPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier", href: "/panier" }, { label: "Commande" }]} />
      <h1 className="text-2xl font-semibold">Commande</h1>
      <CheckoutFlow mode="order" />
    </div>
  );
}
