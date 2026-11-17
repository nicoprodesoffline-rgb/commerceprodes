import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import { SiteFooter } from "@/components/layout/footer";
import { CompareBar } from "@/components/site/compare-bar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AnnouncementBanner } from "@/components/layout/announcement";
import { SiteHeader } from "@/components/layout/site-header";
import { navigationOf } from "@/components/site/catalog-views";
import type { MenuCategory } from "@/components/layout/category-menu";
import type { NavNode } from "@/lib/site-catalog/navigation";
import { MediaPolicyProvider } from "@/components/site/media-policy";
import { imagesAllowed } from "@/lib/site-catalog/media-policy";
import { catalogBasis } from "@/lib/site-catalog/basis";
import { catalogOrNull } from "@/lib/site-catalog/page";
import { loadUniverse } from "@/lib/site-content/source";
import { getShopSettings } from "@/lib/site-shop/source";
import { homeJsonLd, publicOrigin, robotsDirective } from "@/lib/seo/seo";
import { StructuredData } from "@/components/seo/structured-data";
import "./globals.css";

// Toutes les pages sont rendues à la demande : génération servie et instant serveur lus au runtime.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  icons: { icon: "/logo-prodes.png" },
  title: { default: "Catalogue PRODES", template: "%s | PRODES" },
  // 3.19 (S10) : fermé aux moteurs tant que le réglage SITE_SEARCH_ENGINES n'est pas « open » ; l'ouverture est une décision de l'Owner.
  robots: robotsDirective(process.env),
  // Partage social (T-T15) : titre et description sobres, jamais une marque déclarée à un moteur (C22) ni une image inventée.
  description: "Catalogue PRODES : mobilier, signalisation et équipements pour les collectivités. Livraison incluse.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "PRODES", title: "Catalogue PRODES", description: "Mobilier, signalisation et équipements pour les collectivités. Livraison incluse." },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const toMenu = (nodes: NavNode[]): MenuCategory[] => nodes.map((n) => ({ key: n.key, name: n.name, children: toMenu(n.children) }));

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await catalogOrNull();
  const universe = await loadUniverse();
  const shop = await getShopSettings();
  const roots = catalog ? toMenu(navigationOf(catalog).menu) : [];
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* 3.19 (S12) : Organisation et Recherche du site, sur toutes les pages ; les coordonnées viendront des réglages de la boutique (3.23). */}
        <StructuredData value={homeJsonLd(publicOrigin(process.env.SITE_PUBLIC_ORIGIN), null)} />
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[9px] focus:bg-white focus:px-4 focus:py-2">
          Aller au contenu
        </a>
        <MediaPolicyProvider showImages={imagesAllowed(catalog?.meta.data_label)}>
          <CartProvider>
            <AnnouncementBanner shop={shop} />
            <SiteHeader categories={roots} universe={universe} shop={shop} />
            <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
              {children}
            </main>
            <SiteFooter meta={catalog?.meta ?? null} basis={catalog ? catalogBasis(catalog.families, catalog.meta.payload_sha256) : "NOT_DECLARED"} shop={shop} />
            <CompareBar />
            <MobileBottomNav />
          </CartProvider>
        </MediaPolicyProvider>
      </body>
    </html>
  );
}
