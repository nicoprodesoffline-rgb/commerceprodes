"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { codeMessage } from "@/components/site/codes";
import type { Outcome } from "@/components/checkout/submit";

/**
 * Écran de résultat. `received` : référence + lien de consultation (référence + code d'accès) affiché UNE SEULE FOIS
 * — le code n'est conservé nulle part par le site, ni dans le panier ni dans le stockage du navigateur. Le lien
 * place le code après `#` : il n'est jamais transmis au serveur dans l'adresse de la page.
 */
export function ResultPanel({ outcome, onRetry, cartKept = false }: { outcome: Outcome; onRetry?: () => void; cartKept?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => heading.current?.focus(), [outcome]);

  if (outcome.kind === "received") {
    const quote = outcome.objectKind === "quote_request";
    const link = outcome.token ? `${window.location.origin}/recu#ref=${encodeURIComponent(outcome.ref)}&code=${encodeURIComponent(outcome.token)}` : null;
    return (
      <section aria-labelledby="res-h" className="rounded-[14px] border-2 border-positive bg-white p-5" data-testid="result-received">
        <h2 id="res-h" ref={heading} tabIndex={-1} className="text-xl font-semibold">
          {quote ? "Demande de devis reçue" : "Commande reçue — en attente de traitement"}
        </h2>
        <p className="mt-2">
          Référence : <span className="font-mono font-semibold" data-testid="receipt-ref">{outcome.ref}</span>
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {quote
            ? "Votre demande est enregistrée. Elle n'engage aucun prix tant qu'un devis ne vous a pas été adressé."
            : "Votre commande est enregistrée au prix affiché. Elle n'est ni facturée ni payée en ligne ; taxes et port ne sont pas calculés ici."}
          {outcome.replay ? " (Demande déjà reçue : même référence, rien n'a été enregistré deux fois.)" : ""}
        </p>
        {link ? (
          <div className="mt-4 rounded-[9px] border border-caution p-3">
            <p className="text-sm font-semibold">Lien de consultation — conservez-le maintenant, il ne sera plus affiché</p>
            <p className="mt-1 break-all font-mono text-xs" data-testid="receipt-link">{link}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="h-[42px] rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface"
              >
                Copier le lien
              </button>
              <a href={link} className="inline-flex h-[42px] items-center rounded-[9px] px-3 underline">Consulter le reçu</a>
            </div>
            <p aria-live="polite" className="mt-1 text-xs text-positive">{copied ? "Lien copié." : ""}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">Le code d&apos;accès n&apos;est remis qu&apos;au premier envoi : utilisez le lien reçu à ce moment-là.</p>
        )}
        {quote && cartKept && (
          <div className="mt-4 rounded-[9px] border border-line p-3" data-testid="cart-kept">
            <p className="text-sm font-semibold">Votre panier est conservé</p>
            <p className="mt-1 text-sm text-ink-2">
              Ce devis n&apos;est pas une commande. Si vous souhaitez commander ces mêmes articles, passez commande avec ce panier : les prix seront vérifiés de nouveau par le serveur au moment de l&apos;envoi.
              Une commande est un envoi distinct : elle ne remplace pas votre demande de devis.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/commande" className="inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white" data-testid="order-with-this-cart">Passer commande avec ce panier</Link>
              <Link href="/panier" className="inline-flex h-[42px] items-center rounded-[9px] border border-line-strong px-4 font-medium hover:bg-surface">Revoir le panier</Link>
            </div>
          </div>
        )}
        <Link href="/" className={`mt-4 inline-flex h-[42px] items-center rounded-[9px] px-4 font-medium ${quote && cartKept ? "border border-line-strong hover:bg-surface" : "bg-ink text-white"}`}>Retour au catalogue</Link>
      </section>
    );
  }
  if (outcome.kind === "accepted_not_durable") {
    return (
      <section aria-labelledby="res-h" role="alert" className="rounded-[14px] border-2 border-caution bg-white p-5" data-testid="result-not-durable">
        <h2 id="res-h" ref={heading} tabIndex={-1} className="text-lg font-semibold">Demande validée mais NON enregistrée</h2>
        <p className="mt-1 text-sm text-ink-2">Ce serveur fonctionne sans enregistrement (persistance {outcome.persistence}) : rien n&apos;a été transmis.</p>
      </section>
    );
  }
  const codes = outcome.kind === "network" ? ["NETWORK"] : outcome.codes;
  return (
    <section aria-labelledby="res-h" role="alert" className="rounded-[14px] border-2 border-signal bg-white p-5" data-testid="result-refused">
      <h2 id="res-h" ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {outcome.kind === "network" ? "Envoi incertain" : "Envoi refusé — rien n'a été enregistré"}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" data-testid="refusal-codes">
        {codes.map((c) => <li key={c}>{codeMessage(c)}</li>)}
      </ul>
      {outcome.kind === "refused" && Object.entries(outcome.superseded).map(([old, canon]) => (
        <p key={old} className="mt-1 text-sm">
          {old} est remplacée par <Link href={`/article/${canon}`} className="font-mono underline">{canon}</Link>.
        </p>
      ))}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 h-[42px] rounded-[9px] border border-ink bg-white px-4 font-medium hover:bg-surface">
          {outcome.kind === "network" ? "Réessayer à l'identique" : "Revoir et réessayer"}
        </button>
      )}
    </section>
  );
}
