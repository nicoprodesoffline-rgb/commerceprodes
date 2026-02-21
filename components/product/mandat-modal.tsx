"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";

interface MandatModalProps {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  productSku?: string;
}

export function MandatModal({ open, onClose, productTitle, productSku }: MandatModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
          <DialogTitle className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
            Mandat administratif
          </DialogTitle>

          <div className="mb-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              {productTitle}
            </p>
            {productSku && (
              <p className="text-xs text-blue-600 dark:text-blue-400">Réf : {productSku}</p>
            )}
          </div>

          <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
            Vous êtes un organisme public (collectivité, établissement scolaire, hôpital,
            administration…) et souhaitez régler par <strong>mandat administratif</strong> ?
          </p>
          <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
            Contactez-nous directement pour établir un bon de commande :
          </p>

          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xl">📞</span>
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  04 67 24 30 34
                </p>
                <p className="text-xs text-neutral-500">Du lundi au vendredi, 9h–17h</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">✉️</span>
              <div>
                <a
                  href="mailto:contact@prodes.fr"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  contact@prodes.fr
                </a>
                <p className="text-xs text-neutral-500">Réponse sous 24h ouvrées</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            Merci de préciser la référence produit, la quantité souhaitée et les coordonnées
            de votre organisme (nom, SIRET, adresse de livraison).
          </p>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              Fermer
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
