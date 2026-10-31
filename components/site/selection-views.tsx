"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CART_ADDED_EVENT, useCart } from "@/components/cart/cart-provider";
import { previewCart } from "@/components/site/api";
import { codeMessage, codesMessage } from "@/components/site/codes";
import { addWishlistToCart, type WishlistCartResult } from "@/components/site/wishlist-cart";
import { CarouselRow } from "@/components/site/carousel-row";
import { MediaImage } from "@/components/site/media-image";
import { CompareButton, WishlistButton } from "@/components/site/list-buttons";
import { KEYS, clearList, removeFromList, rememberRecent, useLocalList } from "@/components/site/local-list";
import { useFamilies } from "@/components/site/use-families";
import type { LookedUp } from "@/lib/site-catalog/family-lookup";

function Status({ state, empty }: { state: ReturnType<typeof useFamilies>; empty: React.ReactNode }) {
  if (state.status === "loading") return <p role="status" className="text-ink-2">Chargement…</p>;
  if (state.status === "unavailable") return <p role="alert" className="rounded-[14px] border border-caution bg-white p-4">Le catalogue est momentanément indisponible. Votre sélection est conservée sur cet appareil.</p>;
  if (state.status === "error") return <p role="alert" className="rounded-[14px] border border-caution bg-white p-4">Impossible de charger les produits pour le moment. Votre sélection est conservée sur cet appareil ; réessayez dans un instant.</p>;
  if (state.families.length === 0) return <>{empty}</>;
  return null;
}

const emptyBox = (children: React.ReactNode) => <div className="rounded-[14px] border border-line bg-white p-6 text-ink-2">{children}</div>;

/** « Ma sélection » (favoris) : grille des familles retenues sur cet appareil. Les familles retirées du catalogue sont signalées, puis oubliées. */
export function WishlistView() {
  const list = useLocalList(KEYS.wishlist);
  const state = useFamilies(list);
  const gone = state.status === "ready" ? state.missing : [];
  const { add } = useCart();
  const [busy, setBusy] = useState(false);
  const adding = useRef(false);
  const [result, setResult] = useState<WishlistCartResult | null>(null);

  async function onAddAll() {
    if (state.status !== "ready" || adding.current) return;
    const opener = document.activeElement;
    adding.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await addWishlistToCart(state.families, previewCart, add);
      setResult(next);
      if (next.added > 0) window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail: { opener } }));
    } finally {
      adding.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="wishlist-view">
      <h1 className="text-2xl font-semibold">Ma sélection ({list.length})</h1>
      {state.status === "ready" && state.families.length >= 2 && (
        <button type="button" onClick={onAddAll} disabled={busy} className="min-h-[42px] rounded-[9px] bg-ink px-4 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Vérification…" : "Ajouter tout au panier"}
        </button>
      )}
      <div aria-live="polite" aria-busy={busy} className="space-y-2 text-sm">
        {result && <>
          <p>{result.added} ajouté{result.added > 1 ? "s" : ""}, {result.refused.length} refusé{result.refused.length > 1 ? "s" : ""} par le serveur.</p>
          {result.unpriced > 0 && <p>{result.unpriced} ajouté{result.unpriced > 1 ? "s" : ""} sans prix : seule une demande de devis sera possible pour ces produits.</p>}
          {result.refused.length > 0 && <ul className="space-y-1">
            {result.refused.map(({ family, codes }) => <li key={family.slug}><Link href={`/famille/${family.slug}`} className="underline">{family.name}</Link> : {codesMessage(codes)}</li>)}
          </ul>}
          {result.failed.length > 0 && <p>{result.failed.length} non ajouté{result.failed.length > 1 ? "s" : ""} : {codeMessage("NETWORK")} Produits concernés : {result.failed.map((f, i) => <span key={f.slug}>{i > 0 && ", "}<Link href={`/famille/${f.slug}`} className="underline">{f.name}</Link></span>)}</p>}
          {result.choose.length > 0 && <div>
            <p>{result.choose.length} produit{result.choose.length > 1 ? "s demandent" : " demande"} de choisir une variante : ouvrez {result.choose.length > 1 ? "leur" : "sa"} fiche.</p>
            <ul className="mt-1 space-y-1">{result.choose.map((f) => <li key={f.slug}><Link href={`/famille/${f.slug}`} className="underline">{f.name}</Link></li>)}</ul>
          </div>}
        </>}
      </div>
      <Status state={state} empty={emptyBox(<><p className="font-medium text-ink">Votre sélection est vide.</p><p className="mt-1">Utilisez « Ma sélection » sur une fiche ou une carte pour garder un produit ici ; elle reste sur cet appareil.</p><Link href="/recherche" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Voir le catalogue</Link></>)} />
      {gone.length > 0 && (
        <p role="note" className="rounded-[9px] border border-line bg-surface px-3 py-2 text-sm text-ink-2">
          {gone.length} produit{gone.length > 1 ? "s" : ""} de votre sélection n&apos;est plus publié{gone.length > 1 ? "s" : ""} au catalogue.{" "}
          <button type="button" className="font-medium underline" onClick={() => gone.forEach((s) => removeFromList(KEYS.wishlist, s))}>Les retirer</button>
        </p>
      )}
      {state.status === "ready" && state.families.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Ma sélection">
          {state.families.map((f) => (
            <li key={f.slug} className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-white">
              <Link href={`/famille/${f.slug}`} className="group block">
                <MediaImage sha256={f.imageSha} alt="" className="aspect-[4/3] w-full" />
                <span className="block p-4">
                  {f.category && <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">{f.category}</span>}
                  <span className="block font-semibold group-hover:underline">{f.name}</span>
                  {f.reference && <span className="mt-0.5 block font-mono text-xs text-ink-3">Réf : {f.reference}</span>}
                  <span className="mt-2 block text-sm text-ink-2">{f.priceText}</span>
                </span>
              </Link>
              <div className="mt-auto flex flex-wrap gap-2 px-4 pb-4">
                <CompareButton slug={f.slug} name={f.name} />
                <button type="button" onClick={() => removeFromList(KEYS.wishlist, f.slug)} className="inline-flex min-h-[34px] items-center rounded-[9px] border border-line-strong bg-white px-2.5 text-xs font-medium hover:bg-surface">
                  Retirer<span className="sr-only"> {f.name} de ma sélection</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <button type="button" onClick={() => clearList(KEYS.wishlist)} className="text-sm underline">Vider ma sélection</button>}
    </div>
  );
}

/** Comparateur au grain Famille : colonnes = familles (4 au plus), lignes = ce que C0 publie d'une famille. « Meilleur prix » posé par le serveur. */
export function CompareView() {
  const list = useLocalList(KEYS.compare);
  const state = useFamilies(list);
  const enough = list.length >= 2;
  return (
    <div className="space-y-4" data-testid="compare-view">
      <h1 className="text-2xl font-semibold">Comparer des produits</h1>
      {!enough && state.status !== "unavailable" && state.status !== "error" ? (
        emptyBox(<><p className="font-medium text-ink">Sélectionnez au moins 2 produits pour les comparer côte à côte.</p><Link href="/recherche" className="mt-3 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">← Retour au catalogue</Link></>)
      ) : (
        <>
          <Status state={state} empty={null} />
          {state.status === "ready" && state.families.length > 0 && (
            <div className="overflow-x-auto rounded-[14px] border border-line bg-white" data-testid="compare-table-scroll">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <caption className="sr-only">Comparaison de {state.families.length} familles de produits</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="w-32 p-3 text-left text-xs font-medium text-ink-3">&nbsp;</th>
                    {state.families.map((f) => (
                      <th key={f.slug} scope="col" className="min-w-40 p-3 text-left align-top">
                        <MediaImage sha256={f.imageSha} alt="" className="mb-2 aspect-[4/3] w-full rounded-[9px]" />
                        <Link href={`/famille/${f.slug}`} className="font-semibold hover:underline">{f.name}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Catégorie", (f) => f.category ?? "—"],
                    ["Référence", (f) => f.reference ?? `${f.variantCount} variantes`],
                    ["Choix", (f) => (f.axes.length ? f.axes.join(", ") : "Modèle unique")],
                    ["Description", (f) => f.description || "—"],
                  ] as [string, (f: LookedUp) => string][]).map(([label, cell]) => (
                    <tr key={label} className="border-b border-line align-top">
                      <th scope="row" className="p-3 text-left text-xs font-medium text-ink-3">{label}</th>
                      {state.families.map((f) => <td key={f.slug} className={`p-3 ${label === "Référence" && f.reference ? "font-mono text-xs" : ""}`}>{cell(f)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-b border-line align-top">
                    <th scope="row" className="p-3 text-left text-xs font-medium text-ink-3">Prix</th>
                    {state.families.map((f) => (
                      <td key={f.slug} className={`p-3 font-semibold ${f.best ? "bg-signal-subtle" : ""}`}>
                        {f.priceText}
                        {f.best && <span className="ml-2 inline-block rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-white">Meilleur prix</span>}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="p-3 text-left text-xs font-medium text-ink-3">Actions</th>
                    {state.families.map((f) => (
                      <td key={f.slug} className="space-y-2 p-3">
                        <Link href={`/famille/${f.slug}`} className="inline-flex min-h-[34px] items-center text-sm font-medium underline">Voir la fiche →</Link>
                        <div><button type="button" onClick={() => removeFromList(KEYS.compare, f.slug)} className="inline-flex min-h-[34px] items-center rounded-[9px] border border-line-strong bg-white px-2.5 text-xs font-medium hover:bg-surface">Retirer<span className="sr-only"> {f.name} du comparateur</span></button></div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {state.status === "ready" && state.missing.length > 0 && (
            <p role="note" className="text-sm text-ink-2">{state.missing.length} produit{state.missing.length > 1 ? "s" : ""} n&apos;est plus publié{state.missing.length > 1 ? "s" : ""} au catalogue.{" "}
              <button type="button" className="underline" onClick={() => state.missing.forEach((s) => removeFromList(KEYS.compare, s))}>Les retirer</button></p>
          )}
          <p className="text-xs text-ink-3">Comparaison au niveau de la famille : le prix est le plus bas prix unitaire publié. Choisissez la variante sur la fiche.</p>
        </>
      )}
    </div>
  );
}

/** « Récemment consultés » d'une fiche : mémorise la famille vue ; montre jusqu'à 8 AUTRES familles vues si au moins 2 le sont. */
export function RecentlyViewed({ slug }: { slug: string }) {
  const list = useLocalList(KEYS.recent);
  useEffect(() => rememberRecent(slug), [slug]);
  const others = list.filter((s) => s !== slug).slice(0, 8);
  const state = useFamilies(others.length >= 2 ? others : []);
  if (others.length < 2 || state.status !== "ready" || state.families.length < 2) return null;
  return (
    <section aria-labelledby="recent-h" className="mt-10" data-testid="recently-viewed">
      <h2 id="recent-h" className="mb-3 text-lg font-semibold">Récemment consultés</h2>
      <CarouselRow label="Récemment consultés">
        {state.families.map((f) => (
          <li key={f.slug} className="w-44 shrink-0 snap-start">
            <Link href={`/famille/${f.slug}`} className="block overflow-hidden rounded-[14px] border border-line bg-white hover:border-ink-3">
              <MediaImage sha256={f.imageSha} alt="" className="aspect-[4/3] w-full" />
              <span className="block p-3"><span className="block text-sm font-semibold">{f.name}</span><span className="mt-1 block text-xs text-ink-2">{f.priceText}</span></span>
            </Link>
          </li>
        ))}
      </CarouselRow>
    </section>
  );
}
