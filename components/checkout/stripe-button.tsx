"use client";

import { useState } from "react";

interface StripeButtonProps {
  productTitle: string;
  productSku?: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

export function StripeButton({
  productTitle,
  productSku,
  variantId,
  quantity,
  unitPrice,
}: StripeButtonProps) {
  const [showInfo, setShowInfo] = useState(false);

  // TODO: integrate Stripe checkout session creation
  return (
    <>
      <button
        onClick={() => setShowInfo(true)}
        className="text-sm text-blue-600 underline-offset-2 hover:underline"
        title={`Payer en ligne — ${productTitle}${productSku ? ` (Réf: ${productSku})` : ""}`}
      >
        Payer en ligne →
      </button>
      {showInfo && (
        <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Le paiement en ligne sera bientôt disponible. En attendant, utilisez le formulaire
          de devis ou contactez-nous par téléphone.
          <button
            onClick={() => setShowInfo(false)}
            className="ml-2 font-medium underline"
          >
            Fermer
          </button>
        </div>
      )}
    </>
  );
}
