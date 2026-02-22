import { getCart } from "lib/supabase";
import { redirect } from "next/navigation";
import Footer from "components/layout/footer";
import { CheckoutForm } from "./checkout-form";

export const metadata = {
  title: "Finaliser la commande — PRODES",
};

export default async function CheckoutPage() {
  const cart = await getCart();

  if (!cart || cart.lines.length === 0) {
    redirect("/cart");
  }

  const subtotalHT = Number(cart.cost.subtotalAmount.amount);
  const tva = subtotalHT * 0.2;
  const totalTTC = subtotalHT + tva;

  // Résumé des lignes du panier pour l'affichage côté client
  const cartSummary = {
    lines: cart.lines.map((item) => ({
      id: item.id,
      title: item.merchandise.product.title,
      variant: item.merchandise.selectedOptions
        .filter((o) => o.value && o.value !== "Default Title")
        .map((o) => o.value)
        .join(" — "),
      quantity: item.quantity,
      unitPrice: Number(item.cost.totalAmount.amount) / item.quantity,
      lineTotal: Number(item.cost.totalAmount.amount),
      imageUrl: item.merchandise.product.featuredImage?.url ?? null,
    })),
    subtotalHT,
    tva,
    totalTTC,
  };

  return (
    <>
      <div className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-gray-500">
          <a href="/cart" className="hover:text-[#cc1818] transition-colors">Panier</a>
          <span>/</span>
          <span className="text-gray-900 font-medium">Finaliser la commande</span>
        </nav>

        <h1 className="mb-8 text-2xl font-bold text-gray-900">Finaliser la commande</h1>

        <CheckoutForm cartSummary={cartSummary} />
      </div>
      <Footer />
    </>
  );
}
