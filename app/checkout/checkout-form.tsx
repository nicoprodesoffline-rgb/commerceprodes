"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { trackCartEvent } from "lib/analytics/tracker";

type CartLine = {
  id: string | undefined;
  title: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  ecoUnit: number;
  imageUrl: string | null;
};

type CartSummary = {
  lines: CartLine[];
  subtotalHT: number;
  ecoTotal: number;
  tva: number;
  totalTTC: number;
};

function formatHT(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € HT";
}

function formatTTC(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € TTC";
}

const MODES_PAIEMENT = [
  {
    id: "virement",
    label: "Virement bancaire",
    description: "Coordonnées bancaires communiquées à la validation",
  },
  {
    id: "cheque",
    label: "Paiement par chèque",
    description: "Chèque à l'ordre de PRODES, à envoyer sous 7 jours",
  },
  {
    id: "bon_commande",
    label: "Bon de commande",
    description: "Joignez votre bon de commande numéroté — traitement à réception",
  },
  {
    id: "mandat",
    label: "Mandat administratif",
    description: "Réservé aux organismes publics (mairies, écoles, administrations)",
  },
  {
    id: "carte",
    label: "Paiement en ligne par carte",
    description: "Disponible prochainement",
    disabled: true,
  },
];

const REQUIRES_PO = ["bon_commande", "mandat"];

export function CheckoutForm({ cartSummary }: { cartSummary: CartSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modePaiement, setModePaiement] = useState("virement");
  const [livraisonRdv, setLivraisonRdv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bon de commande fields
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [serviceReference, setServiceReference] = useState("");

  // Bloc "Créer un compte" (Section 4)
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [accountServiceAvailable, setAccountServiceAvailable] = useState<boolean | null>(null);
  const [accountResult, setAccountResult] = useState<"success" | "exists" | "error" | null>(null);

  useEffect(() => {
    fetch("/api/auth/register/status")
      .then((r) => r.json())
      .then((d) => setAccountServiceAvailable(d.available === true))
      .catch(() => setAccountServiceAvailable(null));
  }, []);

  // totalTTC already includes ecoTotal; livraison is added on top
  const totalTTCFinal = cartSummary.totalTTC + (livraisonRdv ? 20 : 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const payload = {
      prenom: fd.get("prenom"),
      nom: fd.get("nom"),
      organisme: fd.get("organisme"),
      email: fd.get("email"),
      telephone: fd.get("telephone"),
      adresse: fd.get("adresse"),
      complement: fd.get("complement"),
      codePostal: fd.get("codePostal"),
      ville: fd.get("ville"),
      joursReception: fd.get("joursReception"),
      horairesReception: fd.get("horairesReception"),
      notes: fd.get("notes"),
      modePaiement,
      livraisonRdv,
      // Bon de commande / mandat
      purchaseOrderNumber: REQUIRES_PO.includes(modePaiement) ? purchaseOrderNumber.trim() : undefined,
      serviceReference: serviceReference.trim() || undefined,
      // Snapshot du panier côté client (source primaire pour l'API)
      cart_snapshot: cartSummary.lines,
      ecoTotal: cartSummary.ecoTotal,
    };

    // Validation bon de commande si requis
    if (REQUIRES_PO.includes(modePaiement) && !purchaseOrderNumber.trim()) {
      setError("Le numéro de bon de commande est obligatoire pour ce mode de paiement.");
      return;
    }

    // Validation compte si activé
    if (createAccount && accountPassword) {
      if (accountPassword !== accountPasswordConfirm) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      if (accountPassword.length < 8) {
        setError("Mot de passe trop court (8 caractères minimum)");
        return;
      }
    }

    startTransition(async () => {
      setError(null);
      try {
        try { trackCartEvent("checkout_start"); } catch {}
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Une erreur est survenue. Veuillez réessayer.");
          return;
        }

        // Création compte — non-bloquant mais avec feedback (résultat stocké pour confirmation page)
        if (createAccount && accountPassword && accountPassword === accountPasswordConfirm) {
          try {
            const regRes = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: fd.get("email"),
                password: accountPassword,
                prenom: fd.get("prenom"),
                nom: fd.get("nom"),
                organisme: fd.get("organisme"),
                telephone: fd.get("telephone"),
              }),
            });
            if (regRes.ok) {
              setAccountResult("success");
            } else {
              const regData = await regRes.json().catch(() => ({}));
              setAccountResult(regData?.error === "EMAIL_EXISTS" ? "exists" : "error");
            }
          } catch {
            setAccountResult("error");
          }
        }

        try { trackCartEvent("checkout_complete"); } catch {}
        const confirmUrl = new URL("/checkout/confirmation", window.location.href);
        confirmUrl.searchParams.set("orderId", data.orderId);
        confirmUrl.searchParams.set("mode", data.modePaiement);
        if (accountResult === "success") confirmUrl.searchParams.set("accountCreated", "1");
        router.push(confirmUrl.pathname + confirmUrl.search);
      } catch {
        setError("Erreur de connexion. Veuillez réessayer.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* ── Colonne gauche — Formulaire ── */}
        <div className="flex-1 space-y-6">
          {/* Section 1 — Coordonnées */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">1. Vos coordonnées</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Prénom *</label>
                <input name="prenom" required type="text" className={inputClass} placeholder="Jean" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Nom *</label>
                <input name="nom" required type="text" className={inputClass} placeholder="Dupont" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Nom de votre organisme *</label>
                <input name="organisme" required type="text" className={inputClass} placeholder="Mairie de Lyon" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Email *</label>
                <input name="email" required type="email" className={inputClass} placeholder="jean.dupont@mairie.fr" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Téléphone portable * <span className="font-normal text-gray-400">(obligatoire pour la livraison)</span></label>
                <input name="telephone" required type="tel" className={inputClass} placeholder="06 12 34 56 78" />
              </div>
            </div>
          </section>

          {/* Section 2 — Adresse */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">2. Adresse de livraison</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Numéro et nom de rue *</label>
                <input name="adresse" required type="text" className={inputClass} placeholder="15 rue de la Mairie" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Bâtiment, appartement, lot (optionnel)</label>
                <input name="complement" type="text" className={inputClass} placeholder="Bâtiment A, 2ème étage" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Code postal *</label>
                <input name="codePostal" required type="text" className={inputClass} placeholder="69001" pattern="[0-9]{5}" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Ville *</label>
                <input name="ville" required type="text" className={inputClass} placeholder="Lyon" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Jours de réception *</label>
                <input name="joursReception" required type="text" className={inputClass} placeholder="Du lundi au vendredi" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Horaires de réception *</label>
                <input name="horairesReception" required type="text" className={inputClass} placeholder="De 9h à 13h" />
              </div>
            </div>
          </section>

          {/* Section 3 — Notes */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">3. Notes de commande (optionnel)</h2>
            </div>
            <div className="p-5">
              <textarea
                name="notes"
                rows={3}
                className={inputClass}
                placeholder="Consignes de livraison, références marché public, etc."
              />
            </div>
          </section>

          {/* Section 4 — Créer un compte (optionnel) */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setCreateAccount((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left"
            >
              <div>
                <span className="text-sm font-semibold text-gray-800">4. Créer un compte PRODES</span>
                <span className="ml-2 text-xs text-gray-400">(optionnel)</span>
              </div>
              <span className="text-xs text-gray-400">{createAccount ? "▲" : "▼"}</span>
            </button>
            {createAccount && (
              <div className="border-t border-gray-100 p-5 space-y-4">
                {accountServiceAvailable === false ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-800">Création de compte temporairement indisponible</p>
                    <p className="text-xs text-amber-700 mt-1">
                      La migration SQL 009 n&apos;a pas encore été appliquée.{" "}
                      <a href="/inscription" className="underline">Créer un compte plus tard →</a>
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      Retrouvez vos commandes et devis dans votre espace client.
                      L&apos;email renseigné dans vos coordonnées sera utilisé.
                    </p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Mot de passe *{" "}
                        <span className="font-normal text-gray-400">(8 caractères minimum)</span>
                      </label>
                      <input
                        type="password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        minLength={8}
                        maxLength={100}
                        className={inputClass}
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Confirmer le mot de passe *
                      </label>
                      <input
                        type="password"
                        value={accountPasswordConfirm}
                        onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                        className={inputClass}
                        placeholder="••••••••"
                      />
                    </div>
                    {accountPassword && accountPasswordConfirm && accountPassword !== accountPasswordConfirm && (
                      <p className="text-xs text-red-600">Les mots de passe ne correspondent pas</p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Colonne droite — Récap + paiement ── */}
        <div className="w-full lg:w-80 lg:flex-none">
          <div className="sticky top-28 space-y-4">
            {/* Récapitulatif */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-800">Récapitulatif</h2>
              </div>
              <div className="divide-y divide-gray-50 px-5 py-2">
                {cartSummary.lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <div className="h-10 w-10 flex-none overflow-hidden rounded border border-gray-100 bg-gray-50">
                      {line.imageUrl ? (
                        <Image src={line.imageUrl} alt={line.title} width={40} height={40} className="h-full w-full object-contain" />
                      ) : (
                        <div className="h-full w-full bg-gray-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{line.title}</p>
                      {line.variant && <p className="text-xs text-gray-400 truncate">{line.variant}</p>}
                      <p className="text-xs text-gray-500">× {line.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                      {formatHT(line.lineTotal)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 px-5 py-4 text-sm space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total HT</span>
                  <span>{formatHT(cartSummary.subtotalHT)}</span>
                </div>
                {cartSummary.ecoTotal > 0 && (
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Éco-participation</span>
                    <span>{formatHT(cartSummary.ecoTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>TVA 20%</span>
                  <span>{formatHT(cartSummary.tva)}</span>
                </div>
                {livraisonRdv && (
                  <div className="flex justify-between text-gray-600">
                    <span>Livraison sur RDV</span>
                    <span>{formatHT(20)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-900">
                  <span>Total TTC</span>
                  <span>{formatTTC(totalTTCFinal)}</span>
                </div>
              </div>
            </div>

            {/* Mode de paiement */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-800">Mode de paiement</h2>
              </div>
              <div className="divide-y divide-gray-50 px-5 py-2">
                {MODES_PAIEMENT.map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex cursor-pointer items-start gap-3 py-3 ${mode.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="radio"
                      name="modePaiement"
                      value={mode.id}
                      checked={modePaiement === mode.id}
                      onChange={() => !mode.disabled && setModePaiement(mode.id)}
                      disabled={mode.disabled}
                      className="mt-0.5 accent-[#cc1818]"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{mode.label}</p>
                      <p className="text-xs text-gray-500">{mode.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Champs bon de commande */}
              {REQUIRES_PO.includes(modePaiement) && (
                <div className="mx-5 mb-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      N° bon de commande *
                    </label>
                    <input
                      type="text"
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]`}
                      placeholder="Ex: BC-2025-042"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Référence service <span className="font-normal text-gray-400">(optionnel)</span>
                    </label>
                    <input
                      type="text"
                      value={serviceReference}
                      onChange={(e) => setServiceReference(e.target.value)}
                      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]`}
                      placeholder="Ex: Service achats, Direction générale..."
                    />
                  </div>
                </div>
              )}

              {/* Info mandat */}
              {modePaiement === "mandat" && (
                <div className="mx-5 mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  Cette option est réservée aux organismes publics (mairies, écoles, administrations). Votre commande sera traitée à réception du bon de commande daté, signé et tamponné. Envoyez-le signé à{" "}
                  <a href="mailto:contact@prodes.fr" className="font-medium underline">contact@prodes.fr</a>.
                </div>
              )}
            </div>

            {/* Option livraison RDV */}
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={livraisonRdv}
                  onChange={(e) => setLivraisonRdv(e.target.checked)}
                  className="h-4 w-4 accent-[#cc1818]"
                />
                <span className="text-sm text-gray-700">
                  Livraison sur rendez-vous{" "}
                  <span className="font-medium text-gray-900">(+20,00 € HT)</span>
                </span>
              </label>
            </div>

            {/* Résultat création compte */}
            {accountResult === "error" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                La création de compte a échoué — votre commande est bien enregistrée. Créez votre compte plus tard sur{" "}
                <a href="/inscription" className="underline">la page inscription</a>.
              </div>
            )}
            {accountResult === "exists" && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                Un compte existe déjà pour cet email. <a href="/connexion" className="underline">Se connecter →</a>
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Bouton commander */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-[#cc1818] py-3.5 text-center text-sm font-bold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-60"
            >
              {isPending ? "Traitement en cours…" : "COMMANDER →"}
            </button>
            <p className="text-center text-xs text-gray-400">
              Vos données sont sécurisées et ne sont pas revendues
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";
