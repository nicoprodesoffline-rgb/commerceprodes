"use client";

/**
 * Récapitulatif des lignes et du total tels que SÉLECTIONNÉS PAR LE SERVEUR (aperçu) : partagé par panier, devis,
 * commande. Montants à droite, chiffres tabulaires, base fiscale explicite ; total = somme serveur des lignes chiffrées.
 */
import Link from "next/link";
import { MAX_QUANTITY, type DraftLine } from "@/components/cart/cart-provider";
import { bases } from "@/components/cart/use-cart-preview";
import { codeMessage } from "@/components/site/codes";
import { BasisNotice } from "@/components/site/basis-notice";
import { axesText, money, price, totalBasisLabel, uniformBasis } from "@/components/site/format";
import type { PreviewJson, PreviewLineJson } from "@/lib/site-business/client-types";

/** Le total toujours accompagné de sa base : celle des lignes si elle est unique, « non précisée » si aucune ligne chiffrée n'en porte, sinon les bases présentes, nommées (jamais un total nu). */
export function totalWithBasis(preview: PreviewJson): string {
  const lineBases = preview.lines.filter((l) => l.accepted && l.selection).map((l) => l.selection!.tax_basis_or_status);
  return `${money(preview.total_amount ?? "")} ${totalBasisLabel(lineBases)}`;
}

export function totalsNote(preview: PreviewJson): string {
  const b = bases(preview);
  if (b.size === 1 && b.has("HT")) return "Montants hors taxes et port, non calculés.";
  if (b.size === 1 && b.has("UNQUALIFIED")) return "Base fiscale non précisée par la publication ; taxes et port non calculés.";
  if (b.size > 1) return `Attention : lignes de bases fiscales différentes additionnées telles quelles — ${totalBasisLabel(b).replace(/^\(bases fiscales différentes : /, "").replace(/\)$/, "")} ; taxes et port non calculés.`;
  return "Base fiscale non précisée ; taxes et port non calculés.";
}

function LineStatus({ pl }: { pl: PreviewLineJson | undefined }) {
  if (!pl || pl.accepted) return null;
  const canonical = Object.values(pl.superseded_by ?? {})[0];
  return (
    <p className="mt-1 text-xs text-signal" data-testid="line-problem">
      {pl.error_codes.map(codeMessage).join(" ")}
      {canonical && (
        <>
          {" "}
          <Link href={`/article/${canonical}`} className="font-medium text-ink underline">Voir la nouvelle référence {canonical}</Link>
        </>
      )}
    </p>
  );
}

export function CartLines({
  lines,
  preview,
  loading,
  editable,
  onQuantity,
  onRemove,
}: {
  lines: DraftLine[];
  preview: PreviewJson | null;
  loading: boolean;
  editable: boolean;
  onQuantity?: (index: number, q: number) => void;
  onRemove?: (index: number) => void;
}) {
  const pls = preview && preview.lines.length === lines.length ? preview.lines : null;
  const priced = pls ? pls.filter((l) => l.accepted).length : 0;
  // Une seule base fiscale pour toutes les lignes chiffrées : dite une fois par le bandeau et sur le total ; sinon chaque ligne porte la sienne (friction 14).
  const common = pls ? uniformBasis(pls.filter((l) => l.accepted && l.selection).map((l) => l.selection!.tax_basis_or_status)) : ({ uniform: false } as const);
  return (
    <div className="space-y-2">
    {common.uniform && <BasisNotice basis={common.basis} />}
    <div className="overflow-hidden rounded-[14px] border border-line bg-white">
      <table className="tabular w-full border-collapse text-sm">
        <caption className="sr-only">Lignes du panier, prix sélectionnés par le serveur</caption>
        <thead className="hidden bg-surface text-left text-xs text-ink-3 sm:table-header-group">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Article</th>
            <th scope="col" className="px-3 py-2 font-medium">Quantité</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Prix unitaire</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Total ligne</th>
            {editable && <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const pl = pls?.[i];
            const sel = pl?.accepted ? pl.selection : null;
            const qid = `cart-qty-${i}`;
            return (
              <tr key={`${l.public_item_key}-${i}`} data-testid="cart-line" className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line px-3 py-3 sm:table-row sm:px-0 sm:py-0">
                <td className="col-span-2 min-w-0 sm:px-3 sm:py-3">
                  <Link href={`/famille/${l.family_slug}?article=${l.public_item_key}`} className="inline-flex min-h-[34px] items-center font-medium underline-offset-2 hover:underline">{l.family_name}</Link>
                  <span className="block text-xs text-ink-2">{axesText(l.axes)}</span>
                  <span className="block font-mono text-xs text-ink-3">Réf. {l.public_item_key}</span>
                  <LineStatus pl={pl} />
                </td>
                <td className="sm:px-3 sm:py-3">
                  {editable && onQuantity ? (
                    <>
                      <label htmlFor={qid} className="text-xs text-ink-3 sm:sr-only">Quantité<span className="sr-only"> pour {l.family_name}, {axesText(l.axes)}</span></label>
                      <input
                        id={qid}
                        type="number"
                        min={1}
                        max={MAX_QUANTITY}
                        step={1}
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1) onQuantity(i, n);
                        }}
                        className="block h-[42px] w-24 rounded-[9px] border border-line-strong bg-white px-2"
                      />
                    </>
                  ) : (
                    <span><span className="text-xs text-ink-3 sm:hidden">Quantité </span>{l.quantity}</span>
                  )}
                </td>
                <td className="text-right sm:px-3 sm:py-3">
                  <span className="block text-xs text-ink-3 sm:hidden">Prix unitaire</span>
                  {loading || !pls ? <span className="text-ink-3">…</span> : sel ? (common.uniform ? money(sel.unit_amount) : price(sel.unit_amount, sel.tax_basis_or_status)) : <span className="text-ink-2">sans prix</span>}
                </td>
                <td className="text-right font-semibold sm:px-3 sm:py-3">
                  <span className="block text-xs font-normal text-ink-3 sm:hidden">Total ligne</span>
                  {loading || !pls ? <span className="font-normal text-ink-3">…</span> : sel && pl?.line_total ? (common.uniform ? money(pl.line_total) : price(pl.line_total, sel.tax_basis_or_status)) : "—"}
                </td>
                {editable && onRemove && (
                  <td className="col-span-2 text-right sm:px-3 sm:py-3">
                    <button type="button" onClick={() => onRemove(i)} className="min-h-[34px] rounded-[9px] px-2 text-sm text-ink-2 underline hover:text-ink">
                      Retirer<span className="sr-only"> {l.family_name}, {axesText(l.axes)}</span>
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-line-strong bg-surface px-3 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">
            {pls && priced < lines.length ? `Total des lignes chiffrées (${priced} sur ${lines.length})` : "Total des lignes"}
          </span>
          <span className="tabular text-lg font-semibold" data-testid="cart-total" aria-live="polite" aria-atomic="true">
            {loading || !preview ? "…" : preview.total_amount ? totalWithBasis(preview) : "—"}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-2" data-testid="totals-note">{preview ? totalsNote(preview) : "Base fiscale lue au serveur ; taxes et port non calculés."} Total calculé par le serveur.</p>
      </div>
    </div>
    </div>
  );
}

/** Bannière « catalogue mis à jour » : bloque devis et commande jusqu'à vérification explicite des nouveaux prix. */
export function StaleBanner({ from, to, onAck }: { from: number; to: number; onAck: () => void }) {
  return (
    <div role="alert" className="rounded-[14px] border-2 border-caution bg-white p-4" data-testid="cart-generation-changed">
      <p className="font-semibold">{from === to ? "Les prix doivent être vérifiés de nouveau" : "Le catalogue a été mis à jour"}</p>
      <p className="mt-1 text-sm text-ink-2">
        Les prix et articles ci-dessous ont été vérifiés par le serveur (version {from === to ? to : `${from} → ${to}`}). Vérifiez-les : l&apos;envoi d&apos;une
        demande de devis ou d&apos;une commande est bloqué tant que vous ne les avez pas vérifiés.
      </p>
      <button type="button" onClick={onAck} className="mt-3 h-[42px] rounded-[9px] border border-ink bg-white px-4 font-medium hover:bg-surface">
        J&apos;ai vérifié les nouveaux prix
      </button>
    </div>
  );
}

/** Aperçu indisponible / refusé / réseau : message honnête, panier conservé, réessai. */
export function PreviewProblem({ kind, codes, onRetry }: { kind: "unavailable" | "refused" | "network"; codes: string[]; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[14px] border-2 border-signal bg-white p-4" data-testid="preview-problem">
      <p className="font-semibold">
        {kind === "unavailable" ? "Prix momentanément indisponibles" : kind === "network" ? "Serveur injoignable" : "Panier refusé par le serveur"}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {codes.map(codeMessage).join(" ")} Votre panier est conservé sur cet appareil ; aucun prix n&apos;est affiché sans confirmation du serveur.
      </p>
      <button type="button" onClick={onRetry} className="mt-3 h-[42px] rounded-[9px] border border-ink bg-white px-4 font-medium hover:bg-surface">
        Réessayer
      </button>
    </div>
  );
}
