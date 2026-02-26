import type { Metadata } from "next";
import FaqAccordion from "components/faq/faq-accordion";

export const metadata: Metadata = {
  title: "FAQ – Questions fréquentes | PRODES",
  description:
    "Réponses à vos questions sur les commandes, livraisons, paiements et produits PRODES. Équipements pour collectivités et organismes publics.",
};

const FAQ_GROUPS = [
  {
    group: "Commandes et devis",
    items: [
      {
        question: "Comment obtenir un devis ?",
        answer:
          "Utilisez le formulaire Devis express ou les boutons de demande de devis sur chaque fiche produit. Notre équipe commerciale vous répond sous 24h ouvrées. Vous pouvez également nous appeler au 04 67 24 30 34.",
      },
      {
        question: "Puis-je commander par mandat administratif ?",
        answer:
          "Oui, le mandat administratif est disponible pour tous les organismes publics (mairies, écoles, administrations). Un bon de commande daté, signé et tamponné suffit. Envoyez-le à contact@prodes.fr ou par courrier.",
      },
      {
        question: "Quel est le délai de traitement d'une commande ?",
        answer:
          "48h à 5 jours ouvrés selon les produits et les quantités. Les articles en stock sont expédiés sous 48h. Pour les produits sur commande, le délai est précisé sur votre devis. Livraison sur rendez-vous disponible.",
      },
      {
        question: "Puis-je modifier ou annuler ma commande ?",
        answer:
          "Oui, contactez-nous au 04 67 24 30 34 dans les 24h suivant la validation de votre commande. Passé ce délai, si la commande est déjà en préparation, des frais peuvent s'appliquer.",
      },
      {
        question: "Y a-t-il un minimum de commande ?",
        answer:
          "Non, il n'y a pas de minimum de commande chez PRODES. Des tarifs dégressifs s'appliquent automatiquement selon les quantités commandées, visibles directement sur les fiches produit.",
      },
    ],
  },
  {
    group: "Livraison et montage",
    items: [
      {
        question: "La livraison est-elle incluse dans les prix ?",
        answer:
          "Oui, la livraison est incluse pour la majorité de nos produits. La gamme PUB26 bénéficie de la livraison offerte. Une livraison sur rendez-vous est disponible en option (+20 € HT) pour vous assurer d'être présent à la réception.",
      },
      {
        question: "Dans quels délais suis-je livré ?",
        answer:
          "Les délais varient de 5 à 15 jours ouvrés selon le produit et la destination. Les délais précis sont indiqués sur votre devis. Pour les commandes urgentes, contactez-nous pour connaître les possibilités de livraison express.",
      },
      {
        question: "Proposez-vous l'installation ?",
        answer:
          "PRODES assure la livraison au pied de camion. Nous ne proposons pas l'installation directement, mais nous pouvons vous mettre en relation avec des partenaires installateurs dans votre région.",
      },
    ],
  },
  {
    group: "Paiement",
    items: [
      {
        question: "Quels modes de paiement acceptez-vous ?",
        answer:
          "Nous acceptons le virement bancaire (délai 30 jours fin de mois), le chèque, le mandat administratif pour les collectivités et les organismes publics, et le paiement en ligne par carte bancaire (disponible prochainement).",
      },
      {
        question: "Qu'est-ce que le mandat administratif ?",
        answer:
          "Le mandat administratif est un document officiel émis par une collectivité ou une administration publique, engageant le paiement d'une commande. Il est compatible avec Chorus Pro pour la dématérialisation des factures. Contactez-nous pour un devis adapté.",
      },
      {
        question: "Les prix sont-ils HT ou TTC ?",
        answer:
          "Tous les prix affichés sur notre site sont en euros hors taxes (HT). La TVA de 20% s'applique sur les commandes des particuliers et des associations. Les organismes publics peuvent être exonérés de TVA sous conditions.",
      },
    ],
  },
  {
    group: "Produits",
    items: [
      {
        question: "Puis-je demander des échantillons ou des coloris spécifiques ?",
        answer:
          "Oui, des échantillons de matériaux ou de coloris peuvent être fournis pour certaines gammes. Contactez-nous au 04 67 24 30 34 ou par email à contact@prodes.fr pour faire votre demande.",
      },
      {
        question: "Les produits sont-ils garantis ?",
        answer:
          "Oui, tous nos produits bénéficient de la garantie légale de conformité de 2 ans. Certaines gammes bénéficient de garanties fabricant étendues (jusqu'à 5 ans). Les détails sont précisés sur chaque fiche produit.",
      },
      {
        question: "Qu'est-ce que l'éco-participation ?",
        answer:
          "L'éco-participation est une contribution légale obligatoire au financement de la filière de recyclage des équipements (REP Mobiliers, REP Équipements électriques). Son montant est fixé par les éco-organismes agréés et est affiché sur chaque fiche produit concernée.",
      },
    ],
  },
  {
    group: "Compte et données",
    items: [
      {
        question: "Mes données sont-elles protégées ?",
        answer:
          "Oui, vos données personnelles sont traitées conformément au RGPD (Règlement Général sur la Protection des Données). Elles ne sont jamais revendues à des tiers. Vous disposez d'un droit d'accès, de rectification et de suppression. Consultez nos mentions légales ou contactez-nous à contact@prodes.fr.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6">
      {/* En-tête */}
      <div className="mb-10">
        <span className="inline-block rounded-full bg-[#fef2f2] px-3 py-1 text-xs font-medium text-[#cc1818] mb-3">
          Support
        </span>
        <h1 className="text-3xl font-bold text-gray-900">Questions fréquentes</h1>
        <p className="mt-2 text-gray-500">
          Tout ce que vous devez savoir sur vos achats PRODES
        </p>
      </div>

      {/* Accordion FAQ */}
      <FaqAccordion groups={FAQ_GROUPS} />

      {/* CTA contact */}
      <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="font-medium text-gray-800">Vous ne trouvez pas la réponse ?</p>
        <p className="mt-1 text-sm text-gray-500">Notre équipe vous répond sous 24h ouvrées</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href="tel:+33467243034"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
          >
            📞 04 67 24 30 34
          </a>
          <a
            href="/contact"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#cc1818] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b01414] transition-colors"
          >
            Écrire un message →
          </a>
        </div>
      </div>
    </div>
  );
}
