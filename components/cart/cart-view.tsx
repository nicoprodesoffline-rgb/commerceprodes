"use client";

/**
 * Page panier : lignes (une par variante), quantités modifiables (chaque changement → nouvel aperçu serveur),
 * total serveur, bannière + blocage si le catalogue a changé, puis DEUX suites possibles (une seule primaire) :
 * « Passer commande » si toutes les lignes sont chiffrées, sinon « Demander un devis » seulement.
 */
import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";
import { CartLines, PreviewProblem, StaleBanner } from "@/components/cart/cart-summary";
import { quoteAllowed, useCartPreview } from "@/components/cart/use-cart-preview";

export function CartView() {
  const { ready, ackSequence, acknowledge, setQuantity, remove } = useCart();
  const { state, lines, refresh, stale } = useCartPreview();

  if (!ready || (state.kind === "loading" && lines.length === 0)) return <p className="text-ink-3" role="status">Chargement du panier…</p>;
  if (state.kind === "empty" || lines.length === 0) {
    return (
      <div className="rounded-[14px] border border-line bg-white p-6" data-testid="cart-empty">
        <p>Votre panier est vide.</p>
        <Link href="/" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Parcourir le catalogue</Link>
      </div>
    );
  }
  const preview = state.kind === "ready" ? state.preview : null;
  const canOrder = !!preview && !stale && preview.accepted;
  const canQuote = !!preview && !stale && quoteAllowed(preview);

  return (
    <div className="space-y-6">
      {state.kind === "ready" && stale && ackSequence !== null && <StaleBanner from={ackSequence} to={state.preview.catalogue_sequence} onAck={() => acknowledge(state.preview.catalogue_sequence)} />}
      {(state.kind === "unavailable" || state.kind === "refused" || state.kind === "network") && (
        <PreviewProblem kind={state.kind} codes={state.kind === "unavailable" ? [state.code] : state.kind === "refused" ? state.codes : ["NETWORK"]} onRetry={refresh} />
      )}
      <CartLines lines={lines} preview={preview} loading={state.kind === "loading"} editable onQuantity={setQuantity} onRemove={remove} />
      <div aria-live="polite" className="text-sm text-ink-2" data-testid="cart-next-step">
        {state.kind === "loading" && "Vérification des prix auprès du serveur…"}
        {preview && stale && "Envoi bloqué : vérifiez d'abord les nouveaux prix."}
        {preview && !stale && !preview.accepted && canQuote && "Certaines lignes n'ont pas de prix en ce moment : seule une demande de devis est possible."}
        {preview && !stale && !canQuote && "Retirez ou remplacez les lignes signalées pour continuer."}
      </div>
      <div className="flex flex-wrap gap-3">
        {canOrder ? (
          <>
            <Link href="/commande" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-semibold text-white" data-testid="go-order">Passer commande</Link>
            <Link href="/devis" className="inline-flex h-[42px] items-center rounded-[9px] border border-line-strong bg-white px-5 font-medium hover:bg-surface" data-testid="go-quote">Demander un devis</Link>
          </>
        ) : canQuote ? (
          <Link href="/devis" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-5 font-semibold text-white" data-testid="go-quote">Demander un devis</Link>
        ) : (
          <span className="inline-flex h-[42px] items-center rounded-[9px] border border-dashed border-line-strong px-5 text-ink-3" aria-disabled="true">Suite indisponible</span>
        )}
        <Link href="/" className="inline-flex h-[42px] items-center px-2 text-ink-2 underline">Continuer mes achats</Link>
      </div>
    </div>
  );
}
