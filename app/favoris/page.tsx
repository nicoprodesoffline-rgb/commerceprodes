import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { WishlistView } from "@/components/site/selection-views";

export const metadata: Metadata = { title: "Ma sélection", robots: { index: false, follow: false } };

/** Ma sélection (favoris du navigateur) : la liste est sur l'appareil, les produits sont relus au serveur. */
export default function WishlistPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Ma sélection" }]} />
      <WishlistView />
    </div>
  );
}
