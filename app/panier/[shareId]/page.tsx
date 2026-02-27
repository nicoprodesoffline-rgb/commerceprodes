import Link from "next/link";
import Footer from "components/layout/footer";
import { supabase } from "lib/supabase/client";
import { SharedCartLoader } from "./shared-cart-loader";

export const metadata = { title: "Panier partagé — PRODES" };

export default async function SharedCartPage(props: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await props.params;

  const { data } = await supabase
    .from("shared_carts")
    .select("id, items_json, created_at, expires_at")
    .eq("id", shareId)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!data) {
    return (
      <>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mb-4 text-4xl">🔗</div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Lien expiré</h1>
          <p className="mb-6 text-gray-500">
            Ce lien de panier a expiré ou est introuvable (validité 30 jours).
          </p>
          <Link
            href="/search"
            className="inline-flex items-center rounded-md bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Voir le catalogue →
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  const items = data.items_json as unknown[];
  const expiresAt = new Date(data.expires_at as string).toLocaleDateString("fr-FR");

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          🔗 Panier partagé — valable jusqu&apos;au {expiresAt}
        </div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Panier partagé</h1>
        <SharedCartLoader items={items} />
      </div>
      <Footer />
    </>
  );
}
