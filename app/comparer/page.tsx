import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CompareView } from "@/components/site/selection-views";

// Page exclue des moteurs de recherche (V-E10-06).
export const metadata: Metadata = { title: "Comparateur", robots: { index: false, follow: false } };

/** Comparateur au grain Famille (4 au plus) : la sélection est sur l'appareil, les familles sont relues au serveur. */
export default function ComparePage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Comparateur" }]} />
      <CompareView />
    </div>
  );
}
