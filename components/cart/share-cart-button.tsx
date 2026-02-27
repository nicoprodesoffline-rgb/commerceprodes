"use client";

import { useState } from "react";
import { useCart } from "./cart-context";
import { toast } from "sonner";

export function ShareCartButton({ className }: { className?: string }) {
  const { cart } = useCart();
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    if (cart.lines.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cart/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Impossible de partager le panier");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      toast.success("✓ Lien copié ! Valable 30 jours.");
    } catch {
      toast.error("Erreur lors du partage");
    } finally {
      setLoading(false);
    }
  };

  if (cart.lines.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={loading}
      className={
        className ??
        "flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50"
      }
    >
      🔗 {loading ? "Génération…" : "Partager ce panier"}
    </button>
  );
}
