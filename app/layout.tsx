import { CartProvider } from "components/cart/cart-context";
import { Navbar } from "components/layout/navbar";
import { MobileBottomNav } from "components/layout/mobile-bottom-nav";
import { GeistSans } from "geist/font/sans";
import { ReactNode } from "react";
import "./globals.css";
import { baseUrl } from "lib/utils";
import { getNowUtc, getSnapshotMeta } from "lib/site-dto";

// Instant de référence lu à chaque requête (SPIKE_NOW_UTC) : rendu dynamique.
export const dynamic = "force-dynamic";

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PRODES — Équipements pour collectivités",
    template: "%s | PRODES",
  },
  description: "PRODES, spécialiste des équipements pour mairies, écoles et collectivités.",
  // Spike sur fixture provisoire : jamais indexé.
  robots: {
    follow: false,
    index: false,
  },
  openGraph: {
    siteName: "PRODES",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const nowUtc = getNowUtc();
  const meta = getSnapshotMeta();
  return (
    <html lang="fr" className={GeistSans.variable} suppressHydrationWarning={true}>
      <body className="bg-white text-black selection:bg-red-100">
        <CartProvider nowUtc={nowUtc}>
          <div
            role="note"
            className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950"
          >
            SIMULATION — données de démonstration ({meta.contract_version}, {meta.publication_id}) ·
            instant {nowUtc} · devis et commandes non enregistrés
          </div>
          <Navbar />
          <main className="pb-16 md:pb-0">{children}</main>
          <MobileBottomNav />
        </CartProvider>
      </body>
    </html>
  );
}
