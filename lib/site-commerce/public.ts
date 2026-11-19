/**
 * Cercle 5 : ce que le navigateur a le droit de lire des réglages de vente (le taux, la livraison sur rendez-vous, les marches à suivre, la mention d'information, la version des CGV et la
 * séquence `commerce_sequence` retenue avec le panier). JAMAIS les textes de l'accusé ni l'expéditeur : ils servent le serveur seulement.
 */
import type { CommerceDocument } from "./document";

export type PublicCommerce =
  | { ready: false }
  | {
      ready: true;
      sequence: number;
      tax_rate: string;
      delivery: { label: string; amount_ht: string };
      payment: Record<"cheque" | "virement" | "mandat_administratif", { label: string; instructions: string }>;
      privacy: { version: string; text: string };
      cgv_version: string;
    };

export const NOT_READY: PublicCommerce = { ready: false };

export function publicCommerce(doc: CommerceDocument | null): PublicCommerce {
  if (doc === null) return NOT_READY;
  return {
    ready: true,
    sequence: doc.commerce_sequence,
    tax_rate: doc.tax_rate,
    delivery: { label: doc.delivery_rendez_vous.label, amount_ht: doc.delivery_rendez_vous.amount_ht },
    payment: {
      cheque: { ...doc.payment.cheque },
      virement: { ...doc.payment.virement },
      mandat_administratif: { ...doc.payment.mandat_administratif },
    },
    privacy: { ...doc.privacy_notice },
    cgv_version: doc.cgv_version,
  };
}
