"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { useState } from "react";

interface DevisModalProps {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  productSku?: string;
  defaultQuantity?: number;
}

export function DevisModal({
  open,
  onClose,
  productTitle,
  productSku,
  defaultQuantity = 1,
}: DevisModalProps) {
  const [form, setForm] = useState({
    nom: "",
    email: "",
    telephone: "",
    quantite: defaultQuantity,
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          produit: productTitle,
          sku: productSku,
        }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const inputCls =
    "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white";

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
          <DialogTitle className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
            Demander un devis
          </DialogTitle>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">{productTitle}</span>
            {productSku ? <span className="ml-2 text-neutral-400">Réf : {productSku}</span> : null}
          </p>

          {status === "success" ? (
            <div className="rounded-lg bg-green-50 p-4 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              <p className="font-medium">Demande envoyée !</p>
              <p className="mt-1 text-sm">
                Nous vous répondrons dans les plus brefs délais.
              </p>
              <button
                onClick={onClose}
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Nom *
                  </label>
                  <input
                    name="nom"
                    value={form.nom}
                    onChange={handleChange}
                    required
                    className={inputCls}
                    placeholder="Votre nom"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    className={inputCls}
                    placeholder="email@organisme.fr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    name="telephone"
                    value={form.telephone}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="0X XX XX XX XX"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Quantité
                  </label>
                  <input
                    type="number"
                    name="quantite"
                    value={form.quantite}
                    onChange={handleChange}
                    min={1}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Message
                </label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  rows={3}
                  className={inputCls}
                  placeholder="Précisions sur votre demande, délai souhaité..."
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-red-600">
                  Une erreur est survenue. Veuillez réessayer ou nous contacter par téléphone.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {status === "loading" ? "Envoi..." : "Envoyer la demande"}
                </button>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
