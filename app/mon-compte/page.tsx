"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Footer from "components/layout/footer";
import { useCart } from "components/cart/cart-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Profile = {
  id?: string;
  email: string;
  nom?: string | null;
  organisme?: string | null;
  siret?: string | null;
  telephone?: string | null;
  billing_address?: Record<string, string>;
  shipping_address?: Record<string, string>;
};

type HistoryItem = {
  id: string;
  type: "order" | "devis" | "saved_cart" | "shared_cart";
  label: string;
  status?: string;
  date: string;
  amount?: number | null;
  extra?: Record<string, unknown>;
};

type SavedCart = {
  id: string;
  name: string;
  cart_snapshot: unknown[];
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  traite: "Traité",
  archive: "Archivé",
  refuse: "Refusé",
};

const TYPE_ICONS: Record<string, string> = {
  order: "📦",
  devis: "📋",
  saved_cart: "💾",
  shared_cart: "🔗",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

export default function MonComptePage() {
  const router = useRouter();
  const { addCartItem } = useCart();

  const [email, setEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"profil" | "historique" | "paniers">("profil");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  // Load all data when email is confirmed
  async function loadAccount(mail: string) {
    setLoading(true);
    setError(null);
    try {
      const [pRes, hRes, scRes] = await Promise.all([
        fetch(`/api/account/profile?email=${encodeURIComponent(mail)}`),
        fetch(`/api/account/history?email=${encodeURIComponent(mail)}`),
        fetch(`/api/account/saved-carts?email=${encodeURIComponent(mail)}`),
      ]);

      const pData = await pRes.json();
      const hData = await hRes.json();
      const scData = await scRes.json();

      setProfile(pData.profile ?? { email: mail });
      setHistory(hData.timeline ?? []);
      setSavedCarts(scData.carts ?? []);
    } catch {
      setError("Erreur de chargement. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const m = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(m)) {
      setError("Email invalide");
      return;
    }
    setEmail(m);
    loadAccount(m);
  }

  async function handleSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setSaveStatus("saving");

    const fd = new FormData(e.currentTarget);
    const updates = {
      email: profile.email,
      nom: fd.get("nom"),
      organisme: fd.get("organisme"),
      siret: fd.get("siret"),
      telephone: fd.get("telephone"),
      billing_address: {
        adresse: fd.get("billing_adresse"),
        cp: fd.get("billing_cp"),
        ville: fd.get("billing_ville"),
      },
      shipping_address: {
        adresse: fd.get("shipping_adresse"),
        cp: fd.get("shipping_cp"),
        ville: fd.get("shipping_ville"),
      },
    };

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setError(data.error);
      }
    } catch {
      setSaveStatus("error");
    }
  }

  async function handleDeleteCart(id: string) {
    try {
      await fetch(`/api/account/saved-carts/${id}`, { method: "DELETE" });
      setSavedCarts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Erreur lors de la suppression.");
    }
  }

  async function handleSaveCurrentCart() {
    startTransition(async () => {
      const name = prompt("Nom pour ce panier (ex: Mairie Lyon 2025)");
      if (!name?.trim()) return;
      try {
        const cartSnapshot = JSON.parse(localStorage.getItem("prodes_cart") ?? "null");
        const lines = cartSnapshot?.lines ?? [];
        if (lines.length === 0) {
          setError("Panier vide — rien à sauvegarder.");
          return;
        }
        const res = await fetch("/api/account/saved-carts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name: name.trim(), cart_snapshot: lines }),
        });
        const data = await res.json();
        if (res.ok) {
          setSavedCarts((prev) => [data.cart, ...prev]);
        } else {
          setError(data.error);
        }
      } catch {
        setError("Erreur lors de la sauvegarde.");
      }
    });
  }

  if (!email) {
    return (
      <>
        <div className="mx-auto max-w-md px-4 py-16">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Mon compte PRODES</h1>
          <p className="mb-6 text-sm text-gray-500">Entrez votre email pour accéder à votre espace.</p>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="votre@email.fr"
              className={inputClass}
              required
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-md bg-[#cc1818] py-3 text-sm font-bold text-white hover:bg-[#aa1414]"
            >
              Accéder à mon compte
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-gray-400">
            Pas encore de compte ?{" "}
            <a href="/inscription" className="text-[#cc1818] hover:underline">Créer un compte →</a>
          </p>
        </div>
        <Footer />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400">Chargement de votre compte…</div>
      </div>
    );
  }

  const ba = profile?.billing_address ?? {};
  const sa = profile?.shipping_address ?? {};

  return (
    <>
      <div className="mx-auto max-w-screen-lg px-4 py-8 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
            <p className="text-sm text-gray-500">{email}</p>
          </div>
          <button
            onClick={() => { setEmail(""); setEmailInput(""); setProfile(null); }}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            Changer de compte
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {(["profil", "historique", "paniers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
                section === tab ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "profil" ? "Profil entreprise" : tab === "historique" ? "Historique" : "Paniers sauvegardés"}
            </button>
          ))}
        </div>

        {/* ── Section Profil ── */}
        {section === "profil" && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
              <h2 className="font-semibold text-gray-800">Informations entreprise</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Nom</label>
                  <input name="nom" defaultValue={profile?.nom ?? ""} className={inputClass} placeholder="Jean Dupont" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Organisme</label>
                  <input name="organisme" defaultValue={profile?.organisme ?? ""} className={inputClass} placeholder="Mairie de Lyon" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">SIRET (14 chiffres)</label>
                  <input name="siret" defaultValue={profile?.siret ?? ""} className={inputClass} placeholder="12345678901234" maxLength={14} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Téléphone</label>
                  <input name="telephone" defaultValue={profile?.telephone ?? ""} className={inputClass} />
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
                <h2 className="font-semibold text-gray-800">Adresse de facturation</h2>
                <input name="billing_adresse" defaultValue={(ba as Record<string, string>).adresse ?? ""} className={inputClass} placeholder="Adresse" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="billing_cp" defaultValue={(ba as Record<string, string>).cp ?? ""} className={inputClass} placeholder="Code postal" />
                  <input name="billing_ville" defaultValue={(ba as Record<string, string>).ville ?? ""} className={inputClass} placeholder="Ville" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
                <h2 className="font-semibold text-gray-800">Adresse de livraison</h2>
                <input name="shipping_adresse" defaultValue={(sa as Record<string, string>).adresse ?? ""} className={inputClass} placeholder="Adresse" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="shipping_cp" defaultValue={(sa as Record<string, string>).cp ?? ""} className={inputClass} placeholder="Code postal" />
                  <input name="shipping_ville" defaultValue={(sa as Record<string, string>).ville ?? ""} className={inputClass} placeholder="Ville" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saveStatus === "saving"}
              className={`rounded-md px-6 py-2.5 text-sm font-semibold text-white transition-colors ${
                saveStatus === "saved" ? "bg-green-600" : saveStatus === "error" ? "bg-red-600" : "bg-[#cc1818] hover:bg-[#aa1414]"
              } disabled:opacity-60`}
            >
              {saveStatus === "saving" ? "Enregistrement…" : saveStatus === "saved" ? "✓ Enregistré" : "Enregistrer"}
            </button>
          </form>
        )}

        {/* ── Section Historique ── */}
        {section === "historique" && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Aucun historique trouvé pour cet email.</p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
                  <span className="text-xl">{TYPE_ICONS[item.type] ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                    <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
                  </div>
                  {item.status && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  )}
                  {item.amount && (
                    <span className="text-sm font-semibold text-gray-900">
                      {item.amount.toFixed(2)} € HT
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Section Paniers sauvegardés ── */}
        {section === "paniers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{savedCarts.length} panier(s) sauvegardé(s)</p>
              <button
                onClick={handleSaveCurrentCart}
                disabled={isPending}
                className="rounded-md bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#aa1414] disabled:opacity-60"
              >
                {isPending ? "…" : "Sauvegarder le panier actuel"}
              </button>
            </div>
            {savedCarts.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Aucun panier sauvegardé.</p>
            ) : (
              savedCarts.map((cart) => (
                <div key={cart.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{cart.name}</p>
                    <p className="text-xs text-gray-400">
                      {cart.cart_snapshot?.length ?? 0} produits · {formatDate(cart.updated_at ?? cart.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/cart"
                      onClick={() => {
                        try {
                          const existing = JSON.parse(localStorage.getItem("prodes_cart") ?? "null");
                          if (existing) {
                            existing.lines = cart.cart_snapshot;
                            localStorage.setItem("prodes_cart", JSON.stringify(existing));
                          }
                        } catch {}
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Charger
                    </a>
                    <button
                      onClick={() => handleDeleteCart(cart.id)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
