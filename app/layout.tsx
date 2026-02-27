import { CartProvider } from "components/cart/cart-context";
import { Navbar } from "components/layout/navbar";
import { WelcomeToast } from "components/welcome-toast";
import { CompareProvider } from "lib/compare/context";
import CompareBar from "components/compare/compare-bar";
import { WishlistProvider } from "lib/wishlist/context";
import { WelcomeModal, BuyerBanner } from "components/onboarding/welcome-modal";
import { GeistSans } from "geist/font/sans";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { baseUrl } from "lib/utils";

const { SITE_NAME } = process.env;

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PRODES — Équipements pour collectivités",
    template: "%s | PRODES",
  },
  description:
    "PRODES, spécialiste des équipements pour mairies, écoles et collectivités. 7 000+ références. Devis gratuit sous 24h.",
  keywords: [
    "équipements collectivités",
    "mobilier urbain",
    "devis gratuit",
    "mandat administratif",
    "mairie",
    "école",
    "signalisation",
  ],
  robots: {
    follow: true,
    index: true,
  },
  openGraph: {
    siteName: "PRODES",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={GeistSans.variable} suppressHydrationWarning={true}>
      <body className="bg-white text-black selection:bg-red-100">
        <CartProvider>
          <WishlistProvider>
          <CompareProvider>
            <Navbar />
            <BuyerBanner />
            <main>
              {children}
              <Toaster closeButton />
              <WelcomeToast />
              <WelcomeModal />
            </main>
            <CompareBar />
          </CompareProvider>
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
