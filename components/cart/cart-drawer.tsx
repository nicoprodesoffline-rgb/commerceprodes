"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CART_ADDED_EVENT, CartCount, MAX_QUANTITY, useCart } from "@/components/cart/cart-provider";
import { totalWithBasis } from "@/components/cart/cart-summary";
import { quoteAllowed, useCartPreview } from "@/components/cart/use-cart-preview";
import { axesText, price } from "@/components/site/format";

/**
 * Tiroir du panier (V-E21) : s'ouvre au clic sur « Panier » de l'en-tête et à chaque ajout ; lignes par ordre alphabétique (famille, variante, total de ligne, − / +, retirer) ;
 * « Finaliser la commande » (ou « Demander un devis » quand une ligne n'a pas de prix) et « Voir le panier complet » ; fermeture par la croix, Échap ou un clic à côté.
 * `<dialog>` natif modal (focus gardé, rendu au bouton à la fermeture). Sans script, « Panier » est un lien vers la page panier. Les prix et le total sont ceux de l'aperçu serveur :
 * le navigateur n'en calcule aucun, et l'aperçu n'est demandé que tiroir ouvert.
 */
export function CartDrawerButton() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onAdded = () => setOpen(true);
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(CART_ADDED_EVENT, onAdded);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d || typeof d.showModal !== "function") return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <Link
        href="/panier"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement === "undefined") return;
          e.preventDefault();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="ml-auto inline-flex min-h-[42px] items-center rounded-[9px] px-3 font-medium hover:bg-surface sm:ml-0"
        data-testid="cart-button"
      >
        Panier <CartCount />
      </Link>
      <dialog
        ref={dialog}
        aria-labelledby="tiroir-titre"
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        className="m-0 ml-auto h-full max-h-none w-full max-w-md border-l border-line bg-white p-0 backdrop:bg-ink/40"
        data-testid="cart-drawer"
      >
        {open && <DrawerBody onClose={() => setOpen(false)} />}
      </dialog>
    </>
  );
}

function DrawerBody({ onClose }: { onClose: () => void }) {
  const { setQuantity, remove } = useCart();
  const { state, lines, stale } = useCartPreview();
  const preview = state.kind === "ready" ? state.preview : null;
  const order = lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.family_name.localeCompare(b.l.family_name, "fr", { sensitivity: "base" }) || a.i - b.i);
  const canOrder = !!preview && !stale && preview.accepted;
  const canQuote = !!preview && !stale && quoteAllowed(preview);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="tiroir-titre" className="text-lg font-semibold">Mon panier</h2>
        <button type="button" onClick={onClose} aria-label="Fermer le panier" className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[9px] hover:bg-surface">×</button>
      </div>
      {lines.length === 0 ? (
        <div className="flex-1 p-4" data-testid="drawer-empty">
          <p className="font-medium">Votre panier est vide.</p>
          <Link href="/recherche" onClick={onClose} className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Voir le catalogue →</Link>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-line overflow-y-auto" aria-label="Lignes du panier">
            {order.map(({ l, i }) => {
              const pl = preview?.lines[i];
              return (
                <li key={`${l.public_item_key}-${i}`} className="space-y-2 px-4 py-3" data-testid="drawer-line">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/famille/${l.family_slug}?article=${encodeURIComponent(l.public_item_key)}`} onClick={onClose} className="font-medium hover:underline">{l.family_name}</Link>
                      <p className="text-xs text-ink-3">{axesText(l.axes)}</p>
                    </div>
                    <button type="button" onClick={() => remove(i)} aria-label={`Retirer ${l.family_name} du panier`} className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-ink-3 hover:bg-surface">×</button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center" role="group" aria-label={`Quantité de ${l.family_name}`}>
                      <button type="button" aria-label="Diminuer la quantité" onClick={() => (l.quantity <= 1 ? remove(i) : setQuantity(i, l.quantity - 1))} className="h-[34px] w-[34px] rounded-l-[9px] border border-line-strong bg-white hover:bg-surface">−</button>
                      <span className="tabular inline-flex h-[34px] min-w-10 items-center justify-center border-y border-line-strong px-2 text-sm" aria-live="polite">{l.quantity}</span>
                      <button type="button" aria-label="Augmenter la quantité" onClick={() => setQuantity(i, Math.min(MAX_QUANTITY, l.quantity + 1))} className="h-[34px] w-[34px] rounded-r-[9px] border border-line-strong bg-white hover:bg-surface">+</button>
                    </div>
                    <p className="tabular text-right text-sm font-semibold">
                      {pl?.accepted && pl.selection && pl.line_total ? price(pl.line_total, pl.selection.tax_basis_or_status) : state.kind === "loading" ? "…" : "Sur devis"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="space-y-3 border-t border-line px-4 py-3">
            <p className="flex items-baseline justify-between text-sm" data-testid="drawer-total">
              <span className="text-ink-2">Total</span>
              <span className="tabular text-base font-semibold">{preview && preview.accepted && preview.total_amount ? totalWithBasis(preview) : state.kind === "loading" ? "Vérification des prix…" : "Selon devis"}</span>
            </p>
            {state.kind === "ready" && stale && <p role="alert" className="text-xs text-caution">Le catalogue a changé : vérifiez les prix dans le panier complet avant de continuer.</p>}
            {(state.kind === "unavailable" || state.kind === "refused" || state.kind === "network") && <p role="alert" className="text-xs text-caution">Les prix ne peuvent pas être vérifiés pour le moment. Votre panier est conservé sur cet appareil.</p>}
            <div className="flex flex-wrap gap-2">
              {canOrder ? (
                <Link href="/commande" onClick={onClose} className="inline-flex h-[42px] flex-1 items-center justify-center whitespace-nowrap rounded-[9px] bg-ink px-3 text-sm font-semibold text-white" data-testid="drawer-order">Finaliser la commande →</Link>
              ) : canQuote ? (
                <Link href="/devis" onClick={onClose} className="inline-flex h-[42px] flex-1 items-center justify-center whitespace-nowrap rounded-[9px] bg-ink px-3 text-sm font-semibold text-white" data-testid="drawer-quote">Demander un devis →</Link>
              ) : null}
              <Link href="/panier" onClick={onClose} className="inline-flex h-[42px] flex-1 items-center justify-center rounded-[9px] border border-line-strong bg-white px-4 font-medium hover:bg-surface">Voir le panier complet</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
