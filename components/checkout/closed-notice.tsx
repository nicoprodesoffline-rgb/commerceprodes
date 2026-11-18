import Link from "next/link";
import { businessMode } from "@/lib/site-transactions/config";

/** Cercle 4, 4.15 : `SITE_BUSINESS_PERSISTENCE=closed` — les pages devis et commande disent clairement que la demande en ligne n'est pas ouverte (rien n'est enregistré). */
export function onlineRequestClosed(): boolean {
  try {
    return businessMode() === "closed";
  } catch {
    return false;
  }
}

export function ClosedNotice() {
  return (
    <section role="status" className="rounded-[14px] border-2 border-caution bg-white p-5" data-testid="online-request-closed">
      <h2 className="text-lg font-semibold">La demande en ligne n&apos;est pas encore ouverte</h2>
      <p className="mt-1 text-sm text-ink-2">Rien ne peut être envoyé depuis cette page pour le moment, et rien n&apos;est enregistré. Vous pouvez parcourir le catalogue.</p>
      <Link href="/" className="mt-4 inline-flex h-[44px] items-center rounded-[9px] bg-brand px-4 font-medium text-white hover:bg-brand-dark">Retour au catalogue</Link>
    </section>
  );
}
