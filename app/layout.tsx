import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import { SiteFooter } from "@/components/layout/footer";
import { CompareBar } from "@/components/site/compare-bar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { SiteHeader } from "@/components/layout/site-header";
import { navigationOf } from "@/components/site/catalog-views";
import type { MenuCategory } from "@/components/layout/category-menu";
import type { NavNode } from "@/lib/site-catalog/navigation";
import { isForcedNow, serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogBasis } from "@/lib/site-catalog/basis";
import { catalogOrNull } from "@/lib/site-catalog/page";
import { loadUniverse } from "@/lib/site-content/source";
import "./globals.css";

// Toutes les pages sont rendues à la demande : génération servie et instant serveur lus au runtime.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Catalogue PRODES", template: "%s | PRODES" },
  // Aucun SEO en W1 (scope verdict : SEO = décision propriétaire) : jamais indexé.
  robots: { index: false, follow: false },
  // Partage social (T-T15) : titre et description sobres, jamais une marque déclarée à un moteur (C22) ni une image inventée.
  description: "Catalogue PRODES : mobilier, signalisation et équipements pour les collectivités. Livraison incluse.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "PRODES", title: "Catalogue PRODES", description: "Mobilier, signalisation et équipements pour les collectivités. Livraison incluse." },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const toMenu = (nodes: NavNode[]): MenuCategory[] => nodes.map((n) => ({ key: n.key, name: n.name, children: toMenu(n.children) }));

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await catalogOrNull();
  const universe = await loadUniverse();
  let instant: string | null = null;
  let forced = false;
  try {
    instant = serverNowUtc();
    forced = isForcedNow();
  } catch {
    /* ConfigInvalid : les pages boutique sont servies en 503 par proxy.ts ; l'API refuse. */
  }
  const roots = catalog ? toMenu(navigationOf(catalog).menu) : [];
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col pb-14 md:pb-0">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[9px] focus:bg-white focus:px-4 focus:py-2">
          Aller au contenu
        </a>
        <CartProvider>
          <SiteHeader dataLabel={catalog?.meta.data_label ?? null} categories={roots} universe={universe} />
          <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
          <SiteFooter meta={catalog?.meta ?? null} instantUtc={instant} forcedNow={forced} basis={catalog ? catalogBasis(catalog.families, catalog.meta.payload_sha256) : "NOT_DECLARED"} />
          <CompareBar />
          <MobileBottomNav />
        </CartProvider>
      </body>
    </html>
  );
}
