"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");

    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 lg:px-6">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">Nous contacter</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Colonne gauche — Informations */}
        <div>
          <h2 className="text-2xl font-bold text-[#cc1818]">PRODES</h2>
          <p className="mt-3 text-gray-600 leading-relaxed">
            Équipements pour collectivités et professionnels depuis plus de 20 ans.
            Notre équipe vous répond du lundi au samedi.
          </p>

          <div className="mt-6 space-y-4">
            {[
              { icon: "📞", label: "04 67 24 30 34", href: "tel:+33467243034" },
              { icon: "✉️", label: "contact@prodes.fr", href: "mailto:contact@prodes.fr" },
              { icon: "🕐", label: "Lun–Ven 8h30–19h / Sam 9h–13h" },
              { icon: "📍", label: "France métropolitaine" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xl">{item.icon}</span>
                {item.href ? (
                  <a href={item.href} className="text-sm text-gray-700 hover:text-[#cc1818] transition-colors">
                    {item.label}
                  </a>
                ) : (
                  <span className="text-sm text-gray-700">{item.label}</span>
                )}
              </div>
            ))}
          </div>

          {/* Badges */}
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Devis sous 24h
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              Experts produits
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              7 000+ références
            </span>
          </div>
        </div>

        {/* Colonne droite — Formulaire */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {status === "success" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Message envoyé !</p>
              <p className="mt-1 text-sm text-gray-500">
                Nous vous répondons sous 24h ouvrées.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-4 text-sm text-[#cc1818] hover:underline"
              >
                Envoyer un autre message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    name="prenom"
                    placeholder="Marie"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nom"
                    required
                    placeholder="Dupont"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="marie.dupont@mairie.fr"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  name="telephone"
                  placeholder="04 67 24 30 34"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Objet
                </label>
                <select
                  name="objet"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                >
                  <option value="Demande de devis">Demande de devis</option>
                  <option value="Suivi de commande">Suivi de commande</option>
                  <option value="Question produit">Question produit</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="message"
                  required
                  rows={5}
                  placeholder="Décrivez votre besoin..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818] resize-none"
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="privacy"
                  id="privacy"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#cc1818]"
                />
                <label htmlFor="privacy" className="text-xs text-gray-600">
                  J&apos;accepte la{" "}
                  <a href="/mentions-legales" className="text-[#cc1818] hover:underline">
                    politique de confidentialité
                  </a>
                </label>
              </div>

              {status === "error" && (
                <p className="text-sm text-red-600">
                  Une erreur est survenue. Veuillez réessayer ou nous appeler au 04 67 24 30 34.
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-lg bg-[#cc1818] py-3 text-sm font-semibold text-white hover:bg-[#b01414] transition-colors disabled:opacity-60"
              >
                {status === "loading" ? "Envoi en cours…" : "Envoyer →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
