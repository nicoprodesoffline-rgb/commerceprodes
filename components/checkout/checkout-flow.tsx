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
import { CartLines, PreviewProblem, StaleBanner } from "@/components/cart/cart-summary";
import { TaxTotals, taxAmounts } from "@/components/cart/tax-totals";
import { quoteAllowed, useCartPreview } from "@/components/cart/use-cart-preview";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/checkout/address-fields";
import { ContactFields, EMPTY_CONTACT, ErrorSummary, contactBody, validateContact, type Contact } from "@/components/checkout/contact-fields";
import { useCommerce } from "@/components/checkout/use-commerce";
import { money } from "@/components/site/format";
import { checkAddress, checkCustomerRefs, checkPaymentMethod, PAYMENT_METHODS, type PaymentMethod } from "@/lib/site-requests/fields";
import { DELIVERY_APPOINTMENT, DELIVERY_INCLUDED, type DeliveryOption } from "@/lib/site-requests/amounts";
import { ResultPanel } from "@/components/checkout/result-panel";
import { RECONFIRM, Submitter, type Outcome } from "@/components/checkout/submit";

export function CheckoutFlow({ mode }: { mode: "quote" | "order" }) {
  const { ready: cartReady, ackSequence, acknowledge, clear } = useCart();
  const { state, lines, refresh, stale } = useCartPreview();
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [message, setMessage] = useState("");
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [requiresReview, setRequiresReview] = useState(false);
  const sendLock = useRef(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const commerce = useCommerce();
  const [delivery, setDelivery] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [billingOther, setBillingOther] = useState(false);
  const [billing, setBilling] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [refs, setRefs] = useState({ siret: "", order_number: "", service_code: "" });
  const [option, setOption] = useState<DeliveryOption>(DELIVERY_INCLUDED);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [terms, setTerms] = useState(false);
  const [trap, setTrap] = useState("");   // champ piège : invisible, une personne ne le remplit jamais
  const submitter = useRef(new Submitter()).current;
  const ready = commerce.state.kind === "ready" ? commerce.state.commerce : null;
  const errors: Partial<Record<string, string>> = { ...validateContact(contact, mode === "quote" ? message : null) };
  if (mode === "order") {
    if (!checkAddress({ ...delivery }).ok) errors["delivery-name"] = "Adresse de livraison : nom, adresse, code postal et ville sont obligatoires.";
    if (billingOther && !checkAddress({ ...billing }).ok) errors["billing-name"] = "Adresse de facturation : nom, adresse, code postal et ville sont obligatoires.";
    if (!checkCustomerRefs({ ...refs }).ok) errors["f-siret"] = refs.siret.replace(/[ .]/g, "") !== "" && !/^\d{14}$/.test(refs.siret.replace(/[ .]/g, "")) ? "SIRET : 14 chiffres attendus (laissez vide si vous ne l'avez pas)." : "Références : 60 caractères au maximum.";
    if (!checkPaymentMethod(method).ok) errors["f-payment-cheque"] = "Choisissez un mode de règlement.";
    if (!terms) errors["f-terms"] = "Acceptez les conditions générales de vente pour commander.";
  }
  if (errors["f-siret"] !== undefined) { errors["siret"] = errors["f-siret"]; delete errors["f-siret"]; }
  if (errors["f-payment-cheque"] !== undefined) { errors["payment-cheque"] = errors["f-payment-cheque"]; delete errors["f-payment-cheque"]; }
  if (errors["f-terms"] !== undefined) { errors["terms"] = errors["f-terms"]; delete errors["f-terms"]; }
  const preview = state.kind === "ready" ? state.preview : null;
  // Empreinte de ce qui est confirmé : toute variation de l'aperçu (prix, lignes, génération) annule la confirmation.
  const fingerprint = useMemo(() => (preview ? JSON.stringify([preview.catalogue_sequence, preview.total_amount, ready?.sequence ?? null, option, preview.lines.map((l) => [l.public_item_key, l.quantity, l.selection?.rate_id, l.selection?.unit_amount])]) : null), [preview, ready, option]);
  const needsReview = stale || requiresReview || commerce.needsReconfirm;
  const confirmed = confirmedFor !== null && confirmedFor === fingerprint;
  // Envoi refusé par le contrôle de saisie : le résumé des erreurs reçoit le focus APRÈS son rendu.
  useEffect(() => {
    if (attempt > 0) document.getElementById("error-summary")?.focus();
  }, [attempt]);

  if (outcome?.kind === "received") return <ResultPanel outcome={outcome} cartKept={mode === "quote"} cartOrderable={preview?.accepted === true} />;
  if (!cartReady || state.kind === "loading" || commerce.state.kind === "loading") return <p role="status" className="text-ink-3">Vérification du panier…</p>;
  if (state.kind === "empty") {
    return (
      <div className="rounded-[14px] border border-line bg-white p-6" data-testid="cart-empty">
        <p>Votre panier est vide : ajoutez d&apos;abord des articles depuis le catalogue.</p>
        <Link href="/" className="mt-3 inline-flex h-[44px] items-center rounded-[9px] bg-brand hover:bg-brand-dark px-4 font-medium text-white">Parcourir le catalogue</Link>
      </div>
    );
  }
  if (state.kind !== "ready") {
    return <PreviewProblem kind={state.kind} codes={state.kind === "unavailable" ? [state.code] : state.kind === "refused" ? state.codes : ["NETWORK"]} onRetry={refresh} />;
  }

  if (!preview) return null;
  if (commerce.state.kind !== "ready") {
    return (
      <div role="alert" className="rounded-[14px] border-2 border-caution bg-white p-5" data-testid="shop-not-ready">
        <p className="font-semibold">La boutique n&apos;est pas prête</p>
        <p className="mt-1 text-sm text-ink-2">{commerce.state.kind === "network" ? "Les conditions de vente ne se chargent pas : réessayez dans un instant." : "Les conditions de vente ne sont pas encore publiées : la demande en ligne n'est pas ouverte. Rien n'a été enregistré."} Votre panier est conservé.</p>
        <button type="button" onClick={commerce.refresh} className="mt-3 h-[44px] rounded-[9px] border border-ink bg-white px-4 font-medium hover:bg-surface">Réessayer</button>
      </div>
    );
  }
  const shop = commerce.state.commerce;
  const allowed = mode === "order" ? preview.accepted : quoteAllowed(preview);
  const computed = taxAmounts(preview, shop, mode === "order" ? option : DELIVERY_INCLUDED);
  const total = preview.total_amount ? `${money(computed.amounts.total_ttc)} TTC` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sendLock.current) return;
    setTried(true);
    if (Object.keys(errors).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    if (!preview || needsReview || !allowed || (mode === "order" && !confirmed)) return;
    sendLock.current = true;
    setSending(true);
    try {
      const common = { contract_version: "site_business.v1" as const, catalogue_sequence: ackSequence ?? preview.catalogue_sequence, contact: contactBody(contact) };
      const shared = { commerce_sequence: shop.sequence, privacy_notice: shop.privacy.version, website: trap, total_ttc: computed.amounts.total_ttc };
      const result =
        mode === "order"
          ? await submitter.send(
              "/api/site/order",
              {
                ...common,
                kind: "order",
                currency: "EUR",
                total_amount: preview.total_amount,
                lines: preview.lines.map((l) => ({ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: l.quantity, rate_id: l.selection?.rate_id, unit_amount: l.selection?.unit_amount, line_total: l.line_total })),
              },
              {
                ...shared,
                delivery_option: option,
                addresses: { delivery: { ...delivery }, billing: billingOther ? { ...billing } : null },
                customer_refs: { ...refs },
                payment_method: method,
                terms: { accepted: terms, cgv_version: shop.cgv_version },
              },
            )
          : await submitter.send(
              "/api/site/quote",
              {
                ...common,
                kind: "quote_request",
                message: message.trim() === "" ? null : message,
                lines: preview.lines.map((l) => ({
                  public_item_key: l.public_item_key,
                  variant_axes: l.variant_axes,
                  quantity: l.quantity,
                  displayed: l.accepted && l.selection ? { rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount } : null,
                })),
              },
              shared,
            );
      setOutcome(result);
      // Une COMMANDE reçue vide le panier ; une demande de DEVIS le conserve (friction 9) : on peut ensuite commander ces mêmes lignes, validées de nouveau par le serveur.
      if (result.kind === "received" && mode === "order") clear();
      else if (result.kind === "refused" && result.codes.some((c) => RECONFIRM.has(c))) {
        setConfirmedFor(null);
        setRequiresReview(true);
        refresh();
        commerce.refresh();
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-8" aria-describedby="flow-intro">
      <p id="flow-intro" className="text-ink-2">
        {mode === "order"
          ? "Vérifiez le récapitulatif, indiquez vos coordonnées puis confirmez. Les prix sont vérifiés au moment de l’envoi."
          : "Indiquez vos coordonnées et les précisions utiles à votre demande de devis."}
      </p>
      {outcome && <ResultPanel outcome={outcome} onRetry={outcome.kind === "network" ? undefined : () => setOutcome(null)} />}
      {needsReview && <StaleBanner from={ackSequence ?? preview.catalogue_sequence} to={preview.catalogue_sequence} onAck={() => { acknowledge(preview.catalogue_sequence); setRequiresReview(false); setOutcome(null); }} />}

      <section aria-labelledby="recap-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recap-h" className="text-lg font-semibold">Récapitulatif</h2>
          <Link href="/panier" className="inline-flex min-h-[44px] items-center text-sm underline">Modifier le panier</Link>
        </div>
        <CartLines lines={lines} preview={preview} loading={false} editable={false} />
        <div className="overflow-hidden rounded-[14px] border border-line"><TaxTotals preview={preview} commerce={shop} option={mode === "order" ? option : DELIVERY_INCLUDED} /></div>
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
          <p id="f-message-hint" className="text-xs text-ink-3">Précisez votre besoin. 2 000 caractères au maximum.</p>
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
        <>
          <AddressFields prefix="delivery" legend="Adresse de livraison" value={delivery} onChange={setDelivery} error={errors["delivery-name"]} showError={tried} />
          <div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
              <input type="checkbox" checked={billingOther} onChange={(e) => setBillingOther(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#1a1a18]" data-testid="billing-other" />
              <span>L&apos;adresse de facturation est différente de l&apos;adresse de livraison</span>
            </label>
          </div>
          {billingOther && <AddressFields prefix="billing" legend="Adresse de facturation" value={billing} onChange={setBilling} error={errors["billing-name"]} showError={tried} />}
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-lg font-semibold">Références de votre organisation <span className="text-sm font-normal text-ink-3">(facultatif)</span></legend>
            {([["siret", "SIRET (14 chiffres)", 20, "f-siret"], ["order_number", "Numéro de bon de commande ou d'engagement", 60, "f-order_number"], ["service_code", "Code du service", 60, "f-service_code"]] as const).map(([key, label, max, id]) => (
              <div key={key}>
                <label htmlFor={id} className="block text-sm font-medium">{label}</label>
                <input id={id} name={key} type="text" inputMode={key === "siret" ? "numeric" : undefined} maxLength={max} value={refs[key]} onChange={(e) => setRefs({ ...refs, [key]: e.target.value })}
                  aria-invalid={tried && key === "siret" && errors["siret"] ? true : undefined} className={`mt-1 block h-[44px] w-full rounded-[9px] border bg-white px-3 ${tried && key === "siret" && errors["siret"] ? "border-signal" : "border-line-strong"}`} />
                {tried && key === "siret" && errors["siret"] && <p className="mt-1 text-sm text-signal">{errors["siret"]}</p>}
              </div>
            ))}
          </fieldset>
          <fieldset className="space-y-2" data-testid="delivery-options">
            <legend className="mb-1 text-lg font-semibold">Livraison</legend>
            {([[DELIVERY_INCLUDED, "Livraison incluse"], [DELIVERY_APPOINTMENT, `${shop.delivery.label} : ${money(shop.delivery.amount_ht)} HT en plus`]] as const).map(([value, label]) => (
              <label key={value} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                <input type="radio" name="delivery_option" value={value} checked={option === value} onChange={() => { setOption(value); setConfirmedFor(null); }} className="h-5 w-5 accent-[#1a1a18]" />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2" data-testid="payment-methods">
            <legend className="mb-1 text-lg font-semibold">Mode de règlement</legend>
            <p className="text-sm text-ink-2">Votre commande est enregistrée sur le site ; vous la réglez ensuite comme indiqué ci-dessous.</p>
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                <input id={`f-payment-${m === "cheque" ? "cheque" : m}`} type="radio" name="payment_method" value={m} checked={method === m} onChange={() => setMethod(m)} className="h-5 w-5 accent-[#1a1a18]" />
                <span>{shop.payment[m].label}</span>
              </label>
            ))}
            {tried && errors["payment-cheque"] && <p className="text-sm text-signal">{errors["payment-cheque"]}</p>}
            {method !== "" && (
              <div className="rounded-[9px] border border-line bg-surface p-3" data-testid="payment-instructions">
                <p className="text-sm font-semibold">Marche à suivre : {shop.payment[method].label}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{shop.payment[method].instructions}</p>
              </div>
            )}
          </fieldset>
        </>
      )}

      {mode === "order" && (
        <div className="rounded-[14px] border border-line bg-white p-4">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input id="f-terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#1a1a18]" data-testid="terms" aria-invalid={tried && errors["terms"] ? true : undefined} />
            <span>J&apos;accepte les <Link href="/conditions-generales-de-vente" className="inline-flex min-h-6 items-center underline" target="_blank">conditions générales de vente</Link> (version {shop.cgv_version}).</span>
          </label>
          {tried && errors["terms"] && <p className="mt-1 text-sm text-signal">{errors["terms"]}</p>}
        </div>
      )}

      {mode === "order" && (
        <div className="rounded-[14px] border border-line bg-white p-4">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!allowed || needsReview}
              onChange={(e) => setConfirmedFor(e.target.checked ? fingerprint : null)}
              className="mt-1 h-5 w-5 shrink-0 accent-[#1a1a18]"
              data-testid="order-confirm"
            />
            <span>
              Je confirme la commande de {lines.length} ligne{lines.length > 1 ? "s" : ""} pour un total de <strong className="tabular" data-testid="confirm-total">{total ?? "—"}</strong>.
            </span>
          </label>
        </div>
      )}

      <p className="text-xs text-ink-3" data-testid="privacy-notice">
        {shop.privacy.text} <Link href="/confidentialite" className="inline-flex min-h-6 items-center underline" target="_blank">Politique de confidentialité</Link>
      </p>
      {/* Champ piège : invisible, hors de l'ordre de tabulation et ignoré des lecteurs d'écran ; seul un robot le remplit. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden", visibility: "hidden" }}>
        <label>Ne pas remplir<input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || needsReview || !allowed || (mode === "order" && !confirmed)}
          className="min-h-[44px] rounded-[9px] bg-brand hover:bg-brand-dark px-6 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="submit"
        >
          {sending ? "Envoi en cours…" : mode === "order" ? "Confirmer la commande" : "Envoyer la demande de devis"}
        </button>
        <p role="status" className="text-sm text-ink-2" aria-live="polite" data-testid="submit-status">
          {sending ? "Envoi en cours…" : needsReview ? "Envoi bloqué : vérifiez d'abord les nouveaux prix." : mode === "order" && allowed && !confirmed ? "Cochez la confirmation pour activer l'envoi." : ""}
        </p>
      </div>
    </form>
  );
}
