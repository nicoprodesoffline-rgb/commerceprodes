import type { ShopSettings } from "@/lib/site-shop/settings";

/** CA-2 : pendant la maintenance partielle, le message de la Factory en bandeau sur toutes les pages ; le catalogue reste visible. Texte seulement (React l'échappe). */
export function MaintenanceBanner({ shop }: { shop: ShopSettings }) {
  if (!shop.maintenance.active) return null;
  return (
    <div className="border-b border-caution bg-surface text-center text-sm" role="status" data-testid="maintenance-banner">
      <p className="mx-auto max-w-[1440px] px-4 py-2 lg:px-8">{shop.maintenance.message}</p>
    </div>
  );
}

/** CA-2 : à la place d'un formulaire d'envoi pendant la maintenance. Le panier reste sur l'appareil ; le calcul du panier reste ouvert. */
export function MaintenanceClosed({ message }: { message: string }) {
  return (
    <section role="status" className="rounded-[14px] border-2 border-caution bg-white p-5" data-testid="maintenance-closed">
      <h2 className="text-lg font-semibold">Les demandes en ligne sont fermées pour le moment</h2>
      <p className="mt-1 text-ink-2">{message}</p>
      <p className="mt-1 text-sm text-ink-2">Rien ne peut être envoyé depuis cette page, et rien n&apos;est enregistré. Votre panier est conservé sur cet appareil.</p>
    </section>
  );
}
