import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demande de devis" };

export default function QuotePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier", href: "/panier" }, { label: "Demande de devis" }]} />
      <h1 className="text-2xl font-semibold">Demande de devis</h1>
      <CheckoutFlow mode="quote" />
    </div>
  );
}
