import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import Footer from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isForcedNow, serverNowUtc } from "@/lib/site-catalog/clock";
import { catalogOrNull } from "@/lib/site-catalog/page";
import "./globals.css";

// Toutes les pages sont rendues à la demande : génération servie et instant serveur lus au runtime.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "PRODES — catalogue STAGING_FIXTURE", template: "%s | PRODES (STAGING_FIXTURE)" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await catalogOrNull();
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <CartProvider>
          <SiteHeader meta={catalog?.meta ?? null} instantUtc={serverNowUtc()} forcedNow={isForcedNow()} />
          <main className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-6">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
