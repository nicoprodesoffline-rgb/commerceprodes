"use client";

/**
 * Cercle 5, 5.10 : l'UNIQUE formulaire « Nous écrire » : coordonnées, message, et le produit concerné quand on vient d'une fiche. Il passe par le même canal que les devis
 * (`POST /api/site/message`, un événement `message.received`). Aide à la saisie seulement : le serveur revalide tout (message obligatoire : `message_required`).
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { ErrorSummary } from "@/components/checkout/contact-fields";
import { ResultPanel } from "@/components/checkout/result-panel";
import { Submitter, type Outcome } from "@/components/checkout/submit";
import { useCommerce } from "@/components/checkout/use-commerce";
import { checkContact, checkMessage } from "@/lib/site-requests/fields";

export type AboutProduct = { label: string; url: string; public_item_key: string | null };

const RULE_FIELD: Record<string, [string, string]> = {
  contact_required: ["name", "Nom : champ obligatoire."],
  contact_email: ["email", "E-mail : saisissez une adresse valide avec un nom, le signe @ et un domaine."],
  contact_phone: ["phone", "Téléphone : saisissez 6 à 20 chiffres, avec éventuellement des espaces, points ou tirets."],
  field_length: ["organisation", "Un champ est trop long."],
  message_required: ["message", "Message : écrivez votre message."],
  message_length: ["message", "Message : 5 000 caractères au maximum, sans caractère de contrôle."],
};

export function MessageForm({ product }: { product: AboutProduct | null }) {
  const commerce = useCommerce();
  const [f, setF] = useState({ organisation: "", name: "", email: "", phone: "", message: "" });
  const [trap, setTrap] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const lock = useRef(false);
  const submitter = useRef(new Submitter()).current;

  const errors: Record<string, string> = {};
  const contact = checkContact({ organisation: f.organisation, name: f.name, email: f.email, phone: f.phone });
  if (!contact.ok) for (const r of contact.rules) { const [k, m] = RULE_FIELD[r] ?? ["name", "Champ invalide."]; errors[k] = m; }
  const message = checkMessage(f.message, true, 5000);
  if (!message.ok) { const [k, m] = RULE_FIELD[message.rules[0]!] ?? ["message", "Message invalide."]; errors[k] = m; }

  if (outcome?.kind === "received") return <ResultPanel outcome={outcome} />;
  if (commerce.state.kind === "loading") return <p role="status" className="text-ink-3">Chargement du formulaire…</p>;
  if (commerce.state.kind !== "ready") {
    return (
      <div role="alert" className="rounded-[14px] border-2 border-caution bg-white p-5" data-testid="shop-not-ready">
        <p className="font-semibold">La boutique n&apos;est pas prête</p>
        <p className="mt-1 text-sm text-ink-2">Le formulaire n&apos;est pas encore ouvert. Rien n&apos;a été enregistré.</p>
      </div>
    );
  }
  const shop = commerce.state.commerce;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setTried(true);
    if (Object.keys(errors).length > 0) { document.getElementById("error-summary")?.focus(); return; }
    lock.current = true;
    setSending(true);
    try {
      setOutcome(await submitter.send("/api/site/message", null, {
        commerce_sequence: shop.sequence, privacy_notice: shop.privacy.version, website: trap,
        contact: { organisation: f.organisation, name: f.name, email: f.email, phone: f.phone }, message: f.message,
        product: product === null ? null : { public_item_key: product.public_item_key, label: product.label, url: product.url },
      }));
    } finally {
      lock.current = false;
      setSending(false);
    }
  }

  const field = (key: "organisation" | "name" | "email" | "phone", label: string, type: string, max: number, auto: string, required: boolean) => (
    <div key={key}>
      <label htmlFor={`f-${key}`} className="block text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={`f-${key}`} name={key} type={type} autoComplete={auto} maxLength={max} required={required} value={f[key]} aria-invalid={tried && errors[key] ? true : undefined}
        onChange={(e) => setF({ ...f, [key]: e.target.value })} className={`mt-1 block h-[44px] w-full rounded-[9px] border bg-white px-3 ${tried && errors[key] ? "border-signal" : "border-line-strong"}`} />
      {tried && errors[key] && <p className="mt-1 text-sm text-signal">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-testid="message-form" id="nous-ecrire">
      {outcome && <ResultPanel outcome={outcome} onRetry={outcome.kind === "network" ? undefined : () => setOutcome(null)} />}
      {product && (
        <p className="rounded-[9px] border border-line bg-surface p-3 text-sm" data-testid="message-product">
          Votre question porte sur : <Link href={product.url} className="font-medium underline">{product.label}</Link>
        </p>
      )}
      {tried && <ErrorSummary errors={errors} id="error-summary" />}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Vos coordonnées</legend>
        {field("organisation", "Organisation (facultatif)", "text", 200, "organization", false)}
        {field("name", "Nom", "text", 120, "name", true)}
        {field("email", "E-mail", "email", 254, "email", true)}
        {field("phone", "Téléphone (facultatif)", "tel", 20, "tel", false)}
      </fieldset>
      <div>
        <label htmlFor="f-message" className="block text-sm font-medium">Votre message <span aria-hidden="true">*</span></label>
        <textarea id="f-message" name="message" rows={6} maxLength={5000} required value={f.message} aria-invalid={tried && errors["message"] ? true : undefined}
          onChange={(e) => setF({ ...f, message: e.target.value })} className="mt-1 block w-full rounded-[9px] border border-line-strong bg-white px-3 py-2" />
        {tried && errors["message"] && <p className="mt-1 text-sm text-signal">{errors["message"]}</p>}
      </div>
      <p className="text-xs text-ink-3" data-testid="privacy-notice">{shop.privacy.text} <Link href="/confidentialite" className="inline-flex min-h-6 items-center underline" target="_blank">Politique de confidentialité</Link></p>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden", visibility: "hidden" }}>
        <label>Ne pas remplir<input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
      </div>
      <button type="submit" disabled={sending} className="min-h-[44px] rounded-[9px] bg-brand px-6 py-2 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50" data-testid="submit">
        {sending ? "Envoi en cours…" : "Envoyer le message"}
      </button>
    </form>
  );
}
