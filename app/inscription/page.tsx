"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

function MigrationBanner() {
  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">
            Fonctionnalité temporairement indisponible
          </p>
          <p className="mt-1 text-xs text-amber-700">
            La création de compte nécessite l&apos;application de la migration SQL 009.
            Contactez l&apos;administrateur ou appliquez{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              docs/sql-migrations/009-customer-accounts.sql
            </code>{" "}
            via le dashboard Supabase.
          </p>
          <p className="mt-2 text-xs text-amber-700">
            En attendant, vous pouvez{" "}
            <Link href="/panier" className="underline hover:text-amber-900">
              passer une commande sans compte
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InscriptionPage() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/register/status")
      .then((r) => r.json())
      .then((d) => setServiceAvailable(d.available === true))
      .catch(() => setServiceAvailable(null)); // null = unknown, don't block
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const passwordConfirm = fd.get("password_confirm") as string;

    if (password !== passwordConfirm) {
      setStatus("error");
      setErrorMsg("Les mots de passe ne correspondent pas");
      return;
    }

    setStatus("pending");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password,
          prenom: fd.get("prenom"),
          nom: fd.get("nom"),
          organisme: fd.get("organisme"),
          telephone: fd.get("telephone"),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmedEmail(String(fd.get("email") ?? ""));
        setStatus("success");
      } else if (res.status === 503 && data.error_code === "MIGRATION_REQUIRED") {
        setServiceAvailable(false);
        setStatus("error");
        setErrorMsg(null); // banner will show instead
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "Erreur lors de la création du compte");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Erreur de connexion. Veuillez réessayer.");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Compte créé avec succès</h1>
          <p className="text-sm text-gray-600 mb-1">
            Un email de confirmation a été envoyé à
          </p>
          <p className="text-sm font-semibold text-gray-900 mb-6">{confirmedEmail}</p>
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-block rounded-lg bg-[#cc1818] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#aa1414] transition-colors text-center"
            >
              Retour à l&apos;accueil
            </Link>
            <Link
              href="/search"
              className="inline-block rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
            >
              Parcourir le catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Retour à l&apos;accueil
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Créer un compte PRODES</h1>
          <p className="mt-1 text-sm text-gray-500">
            Accédez à vos commandes, devis et à l&apos;historique de vos achats.
          </p>
        </div>

        {/* Bannière migration si service indisponible */}
        {serviceAvailable === false && <MigrationBanner />}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          {/* Identifiants */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Identifiants de connexion
            </h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Email *</label>
              <input
                name="email"
                type="email"
                required
                className={inputCls}
                placeholder="jean.dupont@mairie.fr"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Mot de passe *{" "}
                <span className="font-normal text-gray-400">(8 caractères minimum)</span>
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={100}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Confirmer le mot de passe *
              </label>
              <input
                name="password_confirm"
                type="password"
                required
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Profil */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Profil <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Prénom</label>
                <input name="prenom" type="text" className={inputCls} placeholder="Jean" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Nom</label>
                <input name="nom" type="text" className={inputCls} placeholder="Dupont" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Organisme</label>
                <input
                  name="organisme"
                  type="text"
                  className={inputCls}
                  placeholder="Mairie de Lyon"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Téléphone</label>
                <input
                  name="telephone"
                  type="tel"
                  className={inputCls}
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
          </div>

          {/* Erreur */}
          {status === "error" && errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "pending" || serviceAvailable === false}
            className="w-full rounded-lg bg-[#cc1818] py-3 text-sm font-bold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-60"
          >
            {status === "pending"
              ? "Création en cours…"
              : serviceAvailable === false
              ? "Service indisponible"
              : "Créer mon compte"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Vous avez déjà passé une commande ?{" "}
            <Link href="/panier" className="text-[#cc1818] hover:underline">
              Retournez au panier
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
