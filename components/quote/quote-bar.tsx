"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuote } from "lib/quote/context";
import { toast } from "sonner";

function formatPriceFR(price: number | null): string {
  if (!price) return "Sur devis";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT";
}

export function QuoteButton() {
  const { quoteCount, quoteItems, removeFromQuote, updateQuantity, clearQuote } = useQuote();
  const [open, setOpen] = useState(false);

  if (quoteCount === 0) {
    return (
      <button
        onClick={() => toast.info("Ajoutez des produits à votre devis depuis les fiches produits.")}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
        title="Devis groupé"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
        title={`Devis groupé — ${quoteCount} article${quoteCount > 1 ? 's' : ''}`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#cc1818] text-[9px] font-bold text-white">
          {quoteCount > 9 ? "9+" : quoteCount}
        </span>
      </button>

      {/* Modal devis groupé */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Devis groupé — {quoteItems.length} produit{quoteItems.length > 1 ? 's' : ''}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Liste produits */}
            <div className="max-h-[50vh] overflow-y-auto">
              {quoteItems.map((item) => (
                <div key={item.handle} className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/product/${item.handle}`}
                      onClick={() => setOpen(false)}
                      className="block truncate text-sm font-medium text-gray-800 hover:text-[#cc1818] transition-colors"
                    >
                      {item.title}
                    </Link>
                    {item.sku && (
                      <p className="text-xs text-gray-400 font-mono">Réf : {item.sku}</p>
                    )}
                    <p className="text-xs text-gray-600">{formatPriceFR(item.price)}</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={() => updateQuantity(item.handle, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.handle, item.quantity + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromQuote(item.handle)}
                    className="flex-none text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="Supprimer"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 space-y-3">
              {/* Build URL with references */}
              <QuoteSendButton items={quoteItems} onClose={() => setOpen(false)} />
              <div className="flex justify-between">
                <button
                  onClick={() => { clearQuote(); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                >
                  Vider la liste
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Continuer mes achats
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuoteSendButton({ items, onClose }: { items: { title: string; sku: string | null; quantity: number }[]; onClose: () => void }) {
  const refs = items
    .map((i) => `${i.quantity}× ${i.sku ?? i.title}`)
    .join(", ");
  const description = `Demande de devis groupé : ${refs}`;
  const url = `/devis-express?product=${encodeURIComponent(description.slice(0, 200))}`;

  return (
    <Link
      href={url}
      onClick={onClose}
      className="block w-full rounded-lg bg-[#cc1818] py-3 text-center text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
    >
      Envoyer le devis groupé →
    </Link>
  );
}

// Bouton "Ajouter au devis" à placer sur la fiche produit
export function AddToQuoteButton({
  handle,
  title,
  sku,
  price,
  imageUrl,
  quantity = 1,
}: {
  handle: string;
  title: string;
  sku?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  quantity?: number;
}) {
  const { addToQuote, removeFromQuote, isInQuote } = useQuote();
  const inQuote = isInQuote(handle);

  const handleClick = () => {
    if (inQuote) {
      removeFromQuote(handle);
      toast.success(`${title} retiré du devis groupé`);
    } else {
      addToQuote({ handle, title, sku: sku ?? null, price: price ?? null, imageUrl, quantity });
      toast.success(`${title} ajouté au devis groupé`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        inQuote
          ? "bg-[#cc1818] text-white hover:bg-[#aa1414]"
          : "border border-gray-300 text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818]"
      }`}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
      {inQuote ? "Dans le devis ✓" : "Ajouter au devis"}
    </button>
  );
}
