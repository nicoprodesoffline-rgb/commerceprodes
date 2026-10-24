import type { Metadata } from "next";
import { ReceiptLookup } from "@/components/checkout/receipt-lookup";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consulter un reçu", referrer: "no-referrer" };

/** Ne dépend pas du catalogue : un reçu reste consultable même si aucune génération n'est servable. */
export default function ReceiptPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Consulter un reçu" }]} />
      <h1 className="text-2xl font-semibold">Consulter un reçu</h1>
      <p className="max-w-2xl text-ink-2">Saisissez la référence et le code d&apos;accès remis lors de l&apos;envoi de votre demande de devis ou de votre commande.</p>
      <ReceiptLookup />
    </div>
  );
}
