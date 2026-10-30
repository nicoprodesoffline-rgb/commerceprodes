"use client";

/**
 * Parcours devis (`mode="quote"`) et commande (`mode="order"`) sur le panier courant.
 * 1. Récapitulatif = aperçu serveur (jamais un prix du navigateur) ; bannière + blocage si le catalogue a changé.
 * 2. Coordonnées (+ message pour le devis).
 * 3. Commande : confirmation EXPLICITE (case + montant affiché) puis `POST /api/site/order` ; devis : `POST /api/site/quote`.
 * La génération envoyée est celle dont le client a VU les prix (`ackSequence`) : si le catalogue a changé depuis,
 * le serveur répond `CART_STALE` / `CATALOG_CHANGED` et le client redemande une vérification (revue A2 F-10).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { CartLines, PreviewProblem, StaleBanner, totalsNote } from "@/components/cart/cart-summary";
import { bases, quoteAllowed, useCartPreview } from "@/components/cart/use-cart-preview";
import { ContactFields, EMPTY_CONTACT, ErrorSummary, contactBody, validateContact, type Contact } from "@/components/checkout/contact-fields";
import { ResultPanel } from "@/components/checkout/result-panel";
import { RECONFIRM, Submitter, type Outcome } from "@/components/checkout/submit";
import { basisLabel, money } from "@/components/site/format";

export function CheckoutFlow({ mode }: { mode: "quote" | "order" }) {
  const { ready, ackSequence, acknowledge, clear } = useCart();
  const { state, lines, refresh, stale } = useCartPreview();
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [message, setMessage] = useState("");
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const submitter = useRef(new Submitter()).current;
  const errors = validateContact(contact, mode === "quote" ? message : null);
  const preview = state.kind === "ready" ? state.preview : null;
  // Empreinte de ce qui est confirmé : toute variation de l'aperçu (prix, lignes, génération) annule la confirmation.
  const fingerprint = useMemo(() => (preview ? JSON.stringify([preview.catalogue_sequence, preview.total_amount, preview.lines.map((l) => [l.public_item_key, l.quantity, l.selection?.rate_id, l.selection?.unit_amount])]) : null), [preview]);
  const confirmed = confirmedFor !== null && confirmedFor === fingerprint;
  // Envoi refusé par le contrôle de saisie : le résumé des erreurs reçoit le focus APRÈS son rendu.
  useEffect(() => {
    if (attempt > 0) document.getElementById("error-summary")?.focus();
  }, [attempt]);

  if (outcome?.kind === "received") return <ResultPanel outcome={outcome} cartKept={mode === "quote"} />;
  if (!ready || state.kind === "loading") return <p role="status" className="text-ink-3">Vérification du panier auprès du serveur…</p>;
  if (state.kind === "empty") {
    return (
      <div className="rounded-[14px] border border-line bg-white p-6" data-testid="cart-empty">
        <p>Votre panier est vide : ajoutez d&apos;abord des articles depuis le catalogue.</p>
        <Link href="/" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Parcourir le catalogue</Link>
      </div>
    );
  }
  if (state.kind !== "ready") {
    return <PreviewProblem kind={state.kind} codes={state.kind === "unavailable" ? [state.code] : state.kind === "refused" ? state.codes : ["NETWORK"]} onRetry={refresh} />;
  }

  if (!preview) return null;
  const allowed = mode === "order" ? preview.accepted : quoteAllowed(preview);
  const b = bases(preview);
  const total = preview.total_amount ? `${money(preview.total_amount)}${b.size === 1 ? ` ${basisLabel([...b][0])}` : ""}` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    if (!preview || stale || !allowed || (mode === "order" && !confirmed)) return;
    setSending(true);
    try {
      const common = { contract_version: "site_business.v1" as const, catalogue_sequence: ackSequence ?? preview.catalogue_sequence, contact: contactBody(contact) };
      const result =
        mode === "order"
          ? await submitter.send("/api/site/order", {
              ...common,
              kind: "order",
              currency: "EUR",
              total_amount: preview.total_amount,
              lines: preview.lines.map((l) => ({ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: l.quantity, rate_id: l.selection?.rate_id, unit_amount: l.selection?.unit_amount, line_total: l.line_total })),
            })
          : await submitter.send("/api/site/quote", {
              ...common,
              kind: "quote_request",
              message: message.trim() === "" ? null : message,
              lines: preview.lines.map((l) => ({
                public_item_key: l.public_item_key,
                variant_axes: l.variant_axes,
                quantity: l.quantity,
                displayed: l.accepted && l.selection ? { rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount } : null,
              })),
            });
      setOutcome(result);
      // Une COMMANDE reçue vide le panier ; une demande de DEVIS le conserve (friction 9) : on peut ensuite commander ces mêmes lignes, validées de nouveau par le serveur.
      if (result.kind === "received" && mode === "order") clear();
      else if (result.kind === "refused" && result.codes.some((c) => RECONFIRM.has(c))) {
        setConfirmedFor(null);
        refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-8" aria-describedby="flow-intro">
      <p id="flow-intro" className="text-ink-2">
        {mode === "order"
          ? "Vérifiez le récapitulatif, indiquez vos coordonnées puis confirmez. La commande est enregistrée au prix affiché, revalidé par le serveur au moment de l'envoi."
          : "Indiquez vos coordonnées : votre demande de devis est enregistrée avec les prix affichés (ou sans prix pour les lignes qui n'en ont pas)."}
      </p>
      {outcome && <ResultPanel outcome={outcome} onRetry={outcome.kind === "network" ? undefined : () => setOutcome(null)} />}
      {stale && ackSequence !== null && <StaleBanner from={ackSequence} to={preview.catalogue_sequence} onAck={() => acknowledge(preview.catalogue_sequence)} />}

      <section aria-labelledby="recap-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recap-h" className="text-lg font-semibold">Récapitulatif</h2>
          <Link href="/panier" className="inline-flex min-h-[34px] items-center text-sm underline">Modifier le panier</Link>
        </div>
        <CartLines lines={lines} preview={preview} loading={false} editable={false} />
        {!allowed && (
          <p role="alert" className="rounded-[9px] border-2 border-signal bg-white p-3 text-sm" data-testid="flow-blocked">
            {mode === "order"
              ? "Commande impossible : au moins une ligne n'a pas de prix applicable ou est refusée. Retirez-la du panier ou demandez un devis."
              : "Demande impossible : au moins une ligne est refusée (voir le récapitulatif). Retirez-la du panier."}
          </p>
        )}
      </section>

      {tried && <ErrorSummary errors={errors} id="error-summary" />}
      <ContactFields value={contact} onChange={setContact} errors={errors} showErrors={tried} />

      {mode === "quote" && (
        <div>
          <label htmlFor="f-message" className="block text-sm font-medium">Message (facultatif)</label>
          <p id="f-message-hint" className="text-xs text-ink-3">Précisions utiles : délais, conditions de livraison… 2 000 caractères au maximum.</p>
          <textarea
            id="f-message"
            rows={4}
            maxLength={2000}
            value={message}
            aria-invalid={tried && errors.message ? true : undefined}
            aria-describedby={`f-message-hint${tried && errors.message ? " f-message-err" : ""}`}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-line-strong bg-white px-3 py-2"
          />
          {tried && errors.message && <p id="f-message-err" className="mt-1 text-sm text-signal">{errors.message}</p>}
        </div>
      )}

      {mode === "order" && (
        <div className="rounded-[14px] border border-line bg-white p-4">
          <label className="flex min-h-[42px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!allowed || stale}
              onChange={(e) => setConfirmedFor(e.target.checked ? fingerprint : null)}
              className="mt-1 h-5 w-5 shrink-0 accent-[#1a1a18]"
              data-testid="order-confirm"
            />
            <span>
              Je confirme la commande de {lines.length} ligne{lines.length > 1 ? "s" : ""} pour un total de <strong className="tabular">{total ?? "—"}</strong>.
              <span className="block text-sm text-ink-2">{totalsNote(preview)} La commande n&apos;est ni facturée ni payée en ligne.</span>
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || stale || !allowed || (mode === "order" && !confirmed)}
          className="h-[42px] rounded-[9px] bg-ink px-6 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="submit"
        >
          {sending ? "Envoi en cours…" : mode === "order" ? "Confirmer la commande" : "Envoyer la demande de devis"}
        </button>
        <p className="text-sm text-ink-2" aria-live="polite">
          {stale ? "Envoi bloqué : vérifiez d'abord les nouveaux prix." : mode === "order" && allowed && !confirmed ? "Cochez la confirmation pour activer l'envoi." : ""}
        </p>
      </div>
    </form>
  );
}
