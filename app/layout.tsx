import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import Footer from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getSnapshotMeta, nowUtc } from "@/lib/site-dto";
import "./globals.css";

// Toutes les pages sont rendues à la demande : l'instant SPIKE_NOW_UTC est lu au runtime.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "PRODES — spike BC1-D", template: "%s | PRODES (spike BC1-D)" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getSnapshotMeta();
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <CartProvider>
          <SiteHeader instantUtc={nowUtc()} publicationId={meta.publication_id} />
          <main className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-6">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
